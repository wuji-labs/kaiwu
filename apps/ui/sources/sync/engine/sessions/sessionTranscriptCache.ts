import type { V2SessionRecord } from '@happier-dev/protocol';

import {
    discardTranscriptCacheScopeExcept,
    discardTranscriptCacheSession,
    loadTranscriptCacheRecord,
    saveTranscriptCacheRecord,
    type TranscriptCacheMessage,
    type TranscriptCacheRecord,
    type TranscriptCacheScope,
} from '@/sync/domains/state/transcriptCachePersistence';
import type { NormalizedMessage } from '@/sync/typesRaw';

/**
 * What the sync engine knows about a session's contiguous main-chain window at flush time.
 * `persist` carries the window; `skip` leaves whatever is on disk alone (the engine cannot vouch
 * for the in-memory transcript right now); `discard` deletes it (the copy is known to be stale or
 * the session is gone).
 */
export type SessionTranscriptPersistDecision =
    | Readonly<{
        kind: 'persist';
        /** Highest contiguous materialized seq — what the next delta fetch resumes after. */
        maxSeq: number;
        /** Lowest seq of the contiguous window ending at `maxSeq`. */
        floorSeq: number;
        hasMoreOlder: boolean | null;
    }>
    | Readonly<{ kind: 'skip' }>
    | Readonly<{ kind: 'discard' }>;

export type SessionTranscriptCacheDependencies = Readonly<{
    readScope: () => TranscriptCacheScope | null;
    readPersistDecision: (sessionId: string) => SessionTranscriptPersistDecision;
    readReceivedUpdatedAt: (sessionId: string, messageId: string) => number | undefined;
    readSessionRow: (sessionId: string) => V2SessionRecord | null;
    /** Messages kept per record — the configured page size, so a hydrate equals one fetched page. */
    readMaxMessages: () => number;
    /** Quiet period before a dirty session is written; streaming keeps pushing it out. */
    flushDelayMs: number;
    onFailure: (operation: 'load' | 'save' | 'discard', error: unknown) => void;
    onInvalidRecord: () => void;
}>;

type BufferEntry = {
    scope: TranscriptCacheScope;
    messagesById: Map<string, NormalizedMessage>;
    dirty: boolean;
    timer: ReturnType<typeof setTimeout> | null;
};

function sameScope(left: TranscriptCacheScope | null, right: TranscriptCacheScope | null): boolean {
    return !!left && !!right && left.serverId === right.serverId && left.accountId === right.accountId;
}

function readSeq(message: NormalizedMessage): number | null {
    return typeof message.seq === 'number' && Number.isFinite(message.seq) && message.seq >= 0
        ? Math.trunc(message.seq)
        : null;
}

/**
 * Sync-side owner of the durable transcript cache: it observes every message the engine applies
 * (one choke point, `Sync.applyMessages`), and on a quiet period, eviction, backgrounding or a
 * scope switch writes the contiguous newest window of each dirty session.
 *
 * Only messages with a server `seq` are kept — optimistic, streaming and synthetic rows are
 * re-derived by their own owners — and the written window is cut to `[floorSeq, maxSeq]`, so a
 * record never contains a hole the delta fetch would not repair.
 */
export function createSessionTranscriptCacheController(deps: SessionTranscriptCacheDependencies) {
    const buffers = new Map<string, BufferEntry>();
    /**
     * Bumped on every discard so a load that raced a discard (an edit repair for an unloaded
     * session, a deletion) cannot paint the copy that was just declared stale.
     */
    const discardEpochBySessionId = new Map<string, number>();

    const readEpoch = (sessionId: string) => discardEpochBySessionId.get(sessionId) ?? 0;
    const bumpEpoch = (sessionId: string) => {
        discardEpochBySessionId.set(sessionId, readEpoch(sessionId) + 1);
    };

    const clearTimer = (entry: BufferEntry) => {
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
    };

    const ensureEntry = (sessionId: string, scope: TranscriptCacheScope): BufferEntry => {
        const existing = buffers.get(sessionId);
        if (existing && sameScope(existing.scope, scope)) return existing;
        if (existing) clearTimer(existing);
        const created: BufferEntry = { scope, messagesById: new Map(), dirty: false, timer: null };
        buffers.set(sessionId, created);
        return created;
    };

    const trimBuffer = (entry: BufferEntry) => {
        // Hold at most twice what a record keeps, so a long-lived session does not retain its whole
        // history twice in memory; the newest seqs are the only ones a record can ever need.
        // Trimming waits for half a record of slack so a streaming session pays the sort once per
        // ~75 messages rather than on every message past the limit.
        const maxMessages = Math.max(1, deps.readMaxMessages());
        const limit = maxMessages * 2;
        if (entry.messagesById.size <= limit + Math.ceil(maxMessages / 2)) return;
        const ordered = [...entry.messagesById.values()].sort((left, right) => (readSeq(left) ?? 0) - (readSeq(right) ?? 0));
        for (const message of ordered.slice(0, ordered.length - limit)) {
            entry.messagesById.delete(message.id);
        }
    };

    const buildRecord = (
        sessionId: string,
        entry: BufferEntry,
        decision: Extract<SessionTranscriptPersistDecision, { kind: 'persist' }>,
    ): TranscriptCacheRecord | null => {
        const windowMessages = [...entry.messagesById.values()]
            .filter((message) => {
                const seq = readSeq(message);
                return seq !== null && seq >= decision.floorSeq && seq <= decision.maxSeq;
            })
            .sort((left, right) => (readSeq(left) ?? 0) - (readSeq(right) ?? 0));
        if (windowMessages.length === 0) return null;
        const maxMessages = Math.max(1, deps.readMaxMessages());
        const kept = windowMessages.slice(Math.max(0, windowMessages.length - maxMessages));
        const truncated = kept.length < windowMessages.length;
        const messages: TranscriptCacheMessage[] = kept.map((message) => ({
            message,
            updatedAt: deps.readReceivedUpdatedAt(sessionId, message.id) ?? null,
        }));
        return {
            sessionId,
            savedAt: Date.now(),
            maxSeq: decision.maxSeq,
            minSeq: readSeq(kept[0]) ?? decision.floorSeq,
            hasMoreOlder: truncated || decision.hasMoreOlder !== false,
            session: deps.readSessionRow(sessionId),
            messages,
        };
    };

    const discardPersisted = (sessionId: string): Promise<void> => {
        bumpEpoch(sessionId);
        return discardTranscriptCacheSession(sessionId).catch((error: unknown) => {
            deps.onFailure('discard', error);
        });
    };

    const flush = (sessionId: string): void => {
        const entry = buffers.get(sessionId);
        if (!entry) return;
        clearTimer(entry);
        if (!entry.dirty) return;
        entry.dirty = false;
        const decision = deps.readPersistDecision(sessionId);
        if (decision.kind === 'skip') return;
        if (decision.kind === 'discard') {
            void discardPersisted(sessionId);
            return;
        }
        const record = buildRecord(sessionId, entry, decision);
        if (!record) return;
        void saveTranscriptCacheRecord(entry.scope, record).catch((error: unknown) => {
            deps.onFailure('save', error);
        });
    };

    const schedule = (sessionId: string, entry: BufferEntry) => {
        clearTimer(entry);
        entry.timer = setTimeout(() => {
            entry.timer = null;
            flush(sessionId);
        }, deps.flushDelayMs);
    };

    return {
        noteAppliedMessages(sessionId: string, messages: readonly NormalizedMessage[]): void {
            const scope = deps.readScope();
            if (!scope || messages.length === 0) return;
            let entry: BufferEntry | null = null;
            for (const message of messages) {
                if (readSeq(message) === null) continue;
                entry ??= ensureEntry(sessionId, scope);
                entry.messagesById.set(message.id, message);
            }
            if (!entry) return;
            trimBuffer(entry);
            entry.dirty = true;
            schedule(sessionId, entry);
        },

        /** Write now (eviction, backgrounding) and keep observing. */
        flush,

        flushAll(): void {
            for (const sessionId of [...buffers.keys()]) flush(sessionId);
        },

        /** Eviction: persist what memory holds, then let it go. */
        flushAndRelease(sessionId: string): void {
            flush(sessionId);
            buffers.delete(sessionId);
        },

        /** Scope switch: write every pending session into the scope it was observed in, then forget. */
        flushAllAndRelease(): void {
            for (const sessionId of [...buffers.keys()]) flush(sessionId);
            buffers.clear();
        },

        readDiscardEpoch: readEpoch,

        discardPersisted,

        /**
         * A changes-feed snapshot fallback means edits may have been missed for every session the
         * engine did not just reconcile in memory; only those in-memory ones keep their copies.
         */
        discardScopeExcept(keepSessionIds: ReadonlySet<string>): Promise<void> {
            const scope = deps.readScope();
            for (const sessionId of buffers.keys()) {
                if (!keepSessionIds.has(sessionId)) bumpEpoch(sessionId);
            }
            return discardTranscriptCacheScopeExcept(scope, keepSessionIds).catch((error: unknown) => {
                deps.onFailure('discard', error);
            });
        },

        async load(sessionId: string): Promise<Readonly<{ scope: TranscriptCacheScope; record: TranscriptCacheRecord; epoch: number }> | null> {
            const scope = deps.readScope();
            if (!scope) return null;
            const epoch = readEpoch(sessionId);
            try {
                const result = await loadTranscriptCacheRecord(scope, sessionId);
                if (result.kind === 'invalid') deps.onInvalidRecord();
                if (result.kind !== 'hit') return null;
                return { scope, record: result.record, epoch };
            } catch (error) {
                deps.onFailure('load', error);
                return null;
            }
        },

        /** After a hydrate, the buffer starts from what is on disk and is not dirty. */
        markHydrated(sessionId: string, scope: TranscriptCacheScope, record: TranscriptCacheRecord): void {
            const entry = ensureEntry(sessionId, scope);
            for (const cached of record.messages) {
                entry.messagesById.set(cached.message.id, cached.message);
            }
            trimBuffer(entry);
            entry.dirty = false;
            clearTimer(entry);
        },

        isScopeCurrent(scope: TranscriptCacheScope): boolean {
            return sameScope(scope, deps.readScope());
        },
    };
}

export type SessionTranscriptCacheController = ReturnType<typeof createSessionTranscriptCacheController>;
