import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDbMocks, installDbModuleMock } from "../api/testkit/dbMocks";

const { emitEphemeral } = vi.hoisted(() => ({
    emitEphemeral: vi.fn(),
}));
const dbMocks = createDbMocks({
    session: ["findMany", "updateMany", "updateManyAndReturn"],
    machine: ["findMany", "updateMany", "updateManyAndReturn"],
} as const);

installDbModuleMock({ db: dbMocks.db });

vi.mock("@/app/events/eventRouter", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/app/events/eventRouter")>();
    return {
        ...actual,
        eventRouter: {
            ...actual.eventRouter,
            emitEphemeral,
        },
    };
});

vi.mock("@/utils/logging/log", () => ({ warn: vi.fn(), log: vi.fn() }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:20:00.000Z"));
    dbMocks.reset();
    dbMocks.db.session.findMany.mockResolvedValue([]);
    dbMocks.db.machine.findMany.mockResolvedValue([]);
    dbMocks.db.session.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.db.machine.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.db.session.updateManyAndReturn.mockResolvedValue([]);
    dbMocks.db.machine.updateManyAndReturn.mockResolvedValue([]);
});

afterEach(() => {
    vi.useRealTimers();
});

async function importTimeoutModule(): Promise<typeof import("./timeout")> {
    return await import("./timeout");
}

describe("presence timeout config", () => {
    it("uses default timeouts when env unset", async () => {
        const { resolvePresenceTimeoutConfig } = await importTimeoutModule();
        const config = resolvePresenceTimeoutConfig({});
        expect(config).toEqual({
            sessionTimeoutMs: 10 * 60 * 1000,
            machineTimeoutMs: 10 * 60 * 1000,
            tickMs: 60 * 1000,
        });
    });

    it("accepts env overrides", async () => {
        const { resolvePresenceTimeoutConfig } = await importTimeoutModule();
        const config = resolvePresenceTimeoutConfig({
            KAIWU_PRESENCE_SESSION_TIMEOUT_MS: "35000",
            KAIWU_PRESENCE_MACHINE_TIMEOUT_MS: "45000",
            KAIWU_PRESENCE_TIMEOUT_TICK_MS: "1000",
        });
        expect(config).toEqual({ sessionTimeoutMs: 35_000, machineTimeoutMs: 45_000, tickMs: 1_000 });
    });

    it("falls back when env is invalid", async () => {
        const { resolvePresenceTimeoutConfig } = await importTimeoutModule();
        const config = resolvePresenceTimeoutConfig({
            KAIWU_PRESENCE_SESSION_TIMEOUT_MS: "nope",
            KAIWU_PRESENCE_MACHINE_TIMEOUT_MS: "0",
            KAIWU_PRESENCE_TIMEOUT_TICK_MS: "-1",
        });
        expect(config).toEqual({
            sessionTimeoutMs: 10 * 60 * 1000,
            machineTimeoutMs: 10 * 60 * 1000,
            tickMs: 60 * 1000,
        });
    });
});

describe("runPresenceTimeoutTick", () => {
    const config = {
        sessionTimeoutMs: 10 * 60 * 1000,
        machineTimeoutMs: 10 * 60 * 1000,
        tickMs: 60 * 1000,
    };

    it("marks timed-out machines inactive with one batch update and emits returned rows after the update", async () => {
        const { runPresenceTimeoutTick } = await importTimeoutModule();
        const oldActiveAt = new Date("2026-01-01T00:00:00.000Z");
        dbMocks.db.machine.findMany.mockResolvedValue([
            { id: "m1" },
            { id: "m2" },
        ]);
        dbMocks.db.machine.updateManyAndReturn.mockResolvedValue([
            { id: "m1", accountId: "u1", lastActiveAt: oldActiveAt },
            { id: "m2", accountId: "u2", lastActiveAt: oldActiveAt },
        ]);

        await runPresenceTimeoutTick(config);

        expect(dbMocks.db.machine.updateManyAndReturn).toHaveBeenCalledTimes(1);
        expect(dbMocks.db.machine.updateManyAndReturn).toHaveBeenCalledWith({
            where: {
                id: { in: ["m1", "m2"] },
                active: true,
                lastActiveAt: { lte: new Date("2026-01-01T00:10:00.000Z") },
            },
            data: { active: false },
            select: { id: true, accountId: true, lastActiveAt: true },
        });
        expect(dbMocks.db.machine.updateMany).not.toHaveBeenCalled();
        expect(emitEphemeral).toHaveBeenCalledTimes(2);
        expect(emitEphemeral).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                userId: "u1",
                payload: expect.objectContaining({ type: "machine-activity", id: "m1", active: false }),
            }),
        );
    });

    it("retains the cutoff when updating machines so activity refreshed after the candidate read stays active", async () => {
        const { runPresenceTimeoutTick } = await importTimeoutModule();
        const oldActiveAt = new Date("2026-01-01T00:00:00.000Z");
        dbMocks.db.machine.findMany.mockResolvedValue([{ id: "m1", accountId: "u1", lastActiveAt: oldActiveAt }]);
        dbMocks.db.machine.updateManyAndReturn.mockImplementation(async (args) => {
            const cutoff = args.where.lastActiveAt?.lte;
            return cutoff
                ? []
                : [{ id: "m1", accountId: "u1", lastActiveAt: new Date("2026-01-01T00:19:00.000Z") }];
        });

        await runPresenceTimeoutTick(config);

        expect(emitEphemeral).not.toHaveBeenCalled();
    });

});
