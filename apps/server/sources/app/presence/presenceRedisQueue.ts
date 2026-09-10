import { getRedisClient } from "@/storage/redis/redis";
import { PresenceBatcher } from "./presenceBatcher";
import { db } from "@/storage/db";
import { forever } from "@/utils/runtime/forever";
import { delay } from "@/utils/runtime/delay";
import { shutdownSignal } from "@/utils/process/shutdown";
import { log } from "@/utils/logging/log";
import { randomUUID } from "node:crypto";
import { createMachinePresenceUpdateManyArgs } from "./machinePresenceWritePlan";

const STREAM_KEY = "presence:alive:v1";
const GROUP = "presence-worker";
const DEFAULT_MAXLEN = 100_000;
const DEFAULT_RECLAIM_IDLE_MS = 60_000;

type PresenceKind = "session" | "machine";

function machinePresenceKey(accountId: string, machineId: string): string {
    return `${accountId}:${machineId}`;
}

function getStreamMaxLen(env: NodeJS.ProcessEnv): number | null {
    const raw = env.HAPPY_PRESENCE_STREAM_MAXLEN?.trim();
    if (!raw) return DEFAULT_MAXLEN;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_MAXLEN;
    if (n === 0) return null;
    return Math.floor(n);
}

function getConsumerName(env: NodeJS.ProcessEnv): string {
    // Must be stable per-process; `HAPPY_INSTANCE_ID` is also used for cluster-aware RPC.
    return env.KAIWU_INSTANCE_ID?.trim() || env.HAPPY_INSTANCE_ID?.trim() || `worker:${process.pid}:${randomUUID()}`;
}

export async function publishMachineAlive(params: { accountId: string; machineId: string; timestamp: number }): Promise<void> {
    const redis = getRedisClient();
    const maxLen = getStreamMaxLen(process.env);
    const maxLenArgs = maxLen ? (["MAXLEN", "~", String(maxLen)] as const) : ([] as const);
    await redis.xadd(
        STREAM_KEY,
        ...maxLenArgs,
        "*",
        "kind",
        "machine",
        "id",
        params.machineId,
        "ts",
        params.timestamp.toString(),
        "accountId",
        params.accountId,
    );
}

async function ensureGroupExists(): Promise<void> {
    const redis = getRedisClient();
    try {
        // MKSTREAM creates the stream if it does not exist.
        await redis.xgroup("CREATE", STREAM_KEY, GROUP, "$", "MKSTREAM");
    } catch (e: any) {
        const msg = typeof e?.message === "string" ? e.message : "";
        if (msg.includes("BUSYGROUP")) return;
        throw e;
    }
}

function parseFields(fields: Array<string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < fields.length; i += 2) {
        out[fields[i]] = fields[i + 1];
    }
    return out;
}

async function flushBatch(batcher: PresenceBatcher): Promise<Map<string, number>> {
    const snapshot = batcher.snapshot();
    const { machines } = snapshot;
    const persistedMachineTimestamps = new Map<string, number>();

    if (machines.length > 0) {
        const results = await Promise.allSettled(
            machines.map((m) =>
                db.machine.updateMany(createMachinePresenceUpdateManyArgs({
                    accountId: m.accountId,
                    machineId: m.machineId,
                    timestamp: m.timestamp,
                })),
            ),
        );
        const persistedMachines: typeof machines = [];
        for (let i = 0; i < results.length; i += 1) {
            const r = results[i];
            if (r.status === "rejected") {
                log({ module: "presence-redis-worker", level: "warn" }, `Machine presence update failed: ${r.reason}`);
                continue;
            }
            const machine = machines[i];
            persistedMachines.push(machine);
            persistedMachineTimestamps.set(machinePresenceKey(machine.accountId, machine.machineId), machine.timestamp);
        }
        batcher.commit({ machines: persistedMachines });
    }

    return persistedMachineTimestamps;
}

function recordStreamEntry(params: Readonly<{
    id: string;
    fields: string[];
    batcher: PresenceBatcher;
    pendingDropAckIds: string[];
    pendingMachineAcks: Map<string, Array<{ id: string; timestamp: number }>>;
}>): void {
    const map = parseFields(params.fields);
    const kind = map.kind as PresenceKind | undefined;
    const entityId = map.id;
    const ts = Number(map.ts);
    const accountId = map.accountId || "";

    if (kind === "machine" && entityId && Number.isFinite(ts) && accountId) {
        params.batcher.recordMachineAlive(accountId, entityId, ts);
        const key = machinePresenceKey(accountId, entityId);
        const entries = params.pendingMachineAcks.get(key) ?? [];
        entries.push({ id: params.id, timestamp: ts });
        params.pendingMachineAcks.set(key, entries);
        return;
    }

    // Supported older servers may leave `kind=session` rows in this shared stream. Those rows do
    // not carry the authenticated machine/socket/fence provenance required by the canonical
    // session-publisher owner, so consuming them must fail closed. ACKing prevents replay without
    // allowing a delayed or reclaimed row to reactivate an archived or successor-owned session.
    params.pendingDropAckIds.push(params.id);
}

export function startPresenceRedisWorker(params?: {
    flushIntervalMs?: number;
    readBlockMs?: number;
    readCount?: number;
    consumerName?: string;
    reclaimIdleMs?: number;
}): { stop: () => Promise<void> } {
    const flushIntervalMs = params?.flushIntervalMs ?? 5000;
    const readBlockMs = params?.readBlockMs ?? 5000;
    const readCount = params?.readCount ?? 200;
    const reclaimIdleMs = params?.reclaimIdleMs ?? DEFAULT_RECLAIM_IDLE_MS;

    const redis = getRedisClient();
    const batcher = new PresenceBatcher();
    let flushTimer: NodeJS.Timeout | null = null;
    const consumerName = params?.consumerName ?? getConsumerName(process.env);
    const pendingDropAckIds: string[] = [];
    const pendingMachineAcks = new Map<string, Array<{ id: string; timestamp: number }>>();
    let lastReclaimAt = 0;

    const flushAndAck = async () => {
        const persistedMachineTimestamps = await flushBatch(batcher);
        const ids = pendingDropAckIds.splice(0, pendingDropAckIds.length);
        for (const [key, persistedTimestamp] of persistedMachineTimestamps) {
            const entries = pendingMachineAcks.get(key);
            if (!entries) continue;
            const remaining = entries.filter((entry) => entry.timestamp > persistedTimestamp);
            if (remaining.length === 0) pendingMachineAcks.delete(key);
            else pendingMachineAcks.set(key, remaining);
            ids.push(...entries.filter((entry) => entry.timestamp <= persistedTimestamp).map((entry) => entry.id));
        }
        if (ids.length > 0) {
            await redis.xack(STREAM_KEY, GROUP, ...ids);
        }
    };

    let flushChain = Promise.resolve();
    const enqueueFlush = () => {
        const flush = flushChain.then(flushAndAck);
        flushChain = flush.catch(() => undefined);
        return flush;
    };

    const startTimer = () => {
        flushTimer = setInterval(() => {
            enqueueFlush()
                .catch((e) => {
                log({ module: "presence-redis-worker", level: "error" }, `Error flushing presence batch: ${e}`);
            });
        }, flushIntervalMs);
        flushTimer.unref?.();
    };

    const stop = async () => {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        await enqueueFlush();
    };

    void forever("presence-redis-worker", async () => {
        await ensureGroupExists();
        if (!flushTimer) startTimer();

        while (!shutdownSignal.aborted) {
            // Reclaim stuck pending entries from crashed workers.
            const now = Date.now();
            if (now - lastReclaimAt > reclaimIdleMs) {
                lastReclaimAt = now;
                try {
                    const res = await (redis as any).xautoclaim(
                        STREAM_KEY,
                        GROUP,
                        consumerName,
                        reclaimIdleMs,
                        "0-0",
                        "COUNT",
                        readCount,
                    );
                    const entries = Array.isArray(res) ? res[1] : [];
                    for (const [id, fields] of entries as any[]) {
                        recordStreamEntry({ id, fields, batcher, pendingDropAckIds, pendingMachineAcks });
                    }
                } catch (e) {
                    // Best-effort: do not kill the worker if reclaim fails.
                    log({ module: "presence-redis-worker", level: "warn" }, `Presence reclaim failed: ${e}`);
                }
            }

            const res = await redis.xreadgroup(
                "GROUP",
                GROUP,
                consumerName,
                "COUNT",
                readCount,
                "BLOCK",
                readBlockMs,
                "STREAMS",
                STREAM_KEY,
                ">",
            );

            if (!res) {
                await delay(1, shutdownSignal);
                continue;
            }

            for (const [, entries] of res as any) {
                for (const [id, fields] of entries as any[]) {
                    recordStreamEntry({ id, fields, batcher, pendingDropAckIds, pendingMachineAcks });
                }
            }
        }
    });

    return { stop };
}
