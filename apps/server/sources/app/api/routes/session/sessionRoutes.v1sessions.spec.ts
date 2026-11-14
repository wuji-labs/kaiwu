import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvReset } from "../../testkit/env";

import {
    buildSessionActivityEphemeral,
    buildUpdateSessionUpdate,
    createSessionRouteTestBuilder,
    emitEphemeral,
    emitUpdate,
    getSessionParticipantUserIds,
    markAccountChanged,
    resetSessionRouteMocks,
    sessionFindFirst,
    sessionFindMany,
    sessionShareFindMany,
    txAccountFindUnique,
    txSessionFindFirst,
    txSessionFindUniqueOrThrow,
    txSessionCreate,
    txSessionUpdate,
    txSessionUpdateMany,
} from "./sessionRoutes.testkit";

const runtimeActivityBaseline = {
    runtimeActivityState: "unknown",
    runtimeActivityActiveCount: 0,
    runtimeActivityObservedAt: null,
    runtimeActivityRevision: 0n,
} as const;

describe("sessionRoutes v1 sessions snapshot", () => {
    const resetStoragePolicyEnv = createEnvReset();

    beforeEach(() => {
        resetStoragePolicyEnv();
        resetSessionRouteMocks();
        sessionFindMany.mockReset();
        sessionShareFindMany.mockReset();
        sessionFindFirst.mockReset();
        txSessionFindFirst.mockReset();
        txAccountFindUnique.mockReset();
        txAccountFindUnique.mockResolvedValue({ encryptionMode: "e2ee" });
        txSessionCreate.mockReset();
    });

    it("GET /v1/sessions returns pendingCount + pendingVersion for owned sessions", async () => {
        const now = new Date(1);
        sessionFindMany.mockResolvedValue([
            {
                ...runtimeActivityBaseline,
                id: "s1",
                seq: 1,
                createdAt: now,
                updatedAt: now,
                metadata: "m1",
                metadataVersion: 1,
                agentState: null,
                agentStateVersion: 0,
                dataEncryptionKey: null,
                pendingCount: 2,
                pendingVersion: 7,
                active: true,
                lastActiveAt: now,
            },
        ]);
        sessionShareFindMany.mockResolvedValue([]);

        const route = await createSessionRouteTestBuilder("GET", "/v1/sessions");
        const { response: res } = await route.invoke();

        expect(res).toEqual({
            sessions: [
                expect.objectContaining({
                    id: "s1",
                    pendingCount: 2,
                    pendingVersion: 7,
                }),
            ],
        });
    });

    it("GET /v1/sessions returns primary turn projection observation time for owned sessions", async () => {
        const now = new Date(1);
        sessionFindMany.mockResolvedValue([
            {
                ...runtimeActivityBaseline,
                id: "s1",
                seq: 1,
                createdAt: now,
                updatedAt: now,
                meaningfulActivityAt: now,
                archivedAt: null,
                encryptionMode: "e2ee",
                metadata: "m1",
                metadataVersion: 1,
                agentState: null,
                agentStateVersion: 0,
                lastViewedSessionSeq: null,
                pendingPermissionRequestCount: 0,
                pendingUserActionRequestCount: 0,
                latestTurnId: "turn-1",
                latestTurnStatus: "in_progress",
                latestTurnStatusObservedAt: 1_234,
                lastRuntimeIssue: null,
                dataEncryptionKey: null,
                pendingCount: 0,
                pendingVersion: 0,
                active: true,
                lastActiveAt: now,
            },
        ]);
        sessionShareFindMany.mockResolvedValue([]);

        const route = await createSessionRouteTestBuilder("GET", "/v1/sessions");
        const { response: res } = await route.invoke();

        expect(res).toEqual({
            sessions: [
                expect.objectContaining({
                    id: "s1",
                    latestTurnId: "turn-1",
                    latestTurnStatus: "in_progress",
                    latestTurnStatusObservedAt: 1_234,
                }),
            ],
        });
    });

    it("GET /v1/sessions returns runtime activity projection for owned and shared sessions", async () => {
        const now = new Date(1);
        sessionFindMany.mockResolvedValue([
            {
                id: "s-owned-runtime",
                seq: 1,
                createdAt: now,
                updatedAt: new Date(3),
                meaningfulActivityAt: now,
                archivedAt: null,
                encryptionMode: "e2ee",
                metadata: "m1",
                metadataVersion: 1,
                agentState: null,
                agentStateVersion: 0,
                lastViewedSessionSeq: null,
                pendingPermissionRequestCount: 0,
                pendingUserActionRequestCount: 0,
                latestTurnId: null,
                latestTurnStatus: null,
                latestTurnStatusObservedAt: null,
                lastRuntimeIssue: null,
                runtimeActivityState: "active",
                runtimeActivityRevision: BigInt(6),
                runtimeActivityActiveCount: 2,
                runtimeActivityObservedAt: BigInt(2_000),
                dataEncryptionKey: null,
                pendingCount: 0,
                pendingBlockedCount: 0,
                pendingVersion: 0,
                active: true,
                lastActiveAt: now,
            },
        ]);
        sessionShareFindMany.mockResolvedValue([
            {
                accessLevel: "edit",
                canApprovePermissions: true,
                encryptedDataKey: Buffer.from([1, 2, 3]),
                sharedByUserId: "owner",
                sharedByUser: {},
                session: {
                    id: "s-shared-runtime",
                    seq: 2,
                    createdAt: now,
                    updatedAt: new Date(2),
                    meaningfulActivityAt: now,
                    archivedAt: null,
                    encryptionMode: "e2ee",
                    metadata: "m2",
                    metadataVersion: 1,
                    agentState: null,
                    agentStateVersion: 0,
                    lastViewedSessionSeq: null,
                    pendingPermissionRequestCount: 0,
                    pendingUserActionRequestCount: 0,
                    latestTurnId: null,
                    latestTurnStatus: null,
                    latestTurnStatusObservedAt: null,
                    lastRuntimeIssue: null,
                    runtimeActivityState: "active",
                    runtimeActivityRevision: BigInt(7),
                    runtimeActivityActiveCount: 1,
                    runtimeActivityObservedAt: BigInt(3_000),
                    pendingCount: 0,
                    pendingBlockedCount: 0,
                    pendingVersion: 0,
                    active: true,
                    lastActiveAt: now,
                },
            },
        ]);

        const route = await createSessionRouteTestBuilder("GET", "/v1/sessions");
        const { response: res } = await route.invoke();

        expect(res).toEqual({
            sessions: [
                expect.objectContaining({
                    id: "s-owned-runtime",
                    runtimeActivityState: "active",
                    runtimeActivityRevision: 6,
                    runtimeActivityActiveCount: 2,
                    runtimeActivityObservedAt: 2_000,
                }),
                expect.objectContaining({
                    id: "s-shared-runtime",
                    runtimeActivityState: "active",
                    runtimeActivityRevision: 7,
                    runtimeActivityActiveCount: 1,
                    runtimeActivityObservedAt: 3_000,
                }),
            ],
        });
        for (const session of (res as { sessions: unknown[] }).sessions) {
            expect(session).not.toHaveProperty("runtimeActivitySourceClass");
        }
    });

    it("GET /v1/sessions returns pendingCount + pendingVersion for shared sessions", async () => {
        const now = new Date(1);
        sessionFindMany.mockResolvedValue([]);
        sessionShareFindMany.mockResolvedValue([
            {
                accessLevel: "edit",
                canApprovePermissions: true,
                encryptedDataKey: Buffer.from([1, 2, 3]),
                sharedByUserId: "owner",
                sharedByUser: {},
                session: {
                    ...runtimeActivityBaseline,
                    id: "s2",
                    seq: 2,
                    createdAt: now,
                    updatedAt: now,
                    metadata: "m2",
                    metadataVersion: 1,
                    agentState: null,
                    agentStateVersion: 0,
                    pendingCount: 9,
                    pendingVersion: 10,
                    active: true,
                    lastActiveAt: now,
                },
            },
        ]);

        const route = await createSessionRouteTestBuilder("GET", "/v1/sessions");
        const { response: res } = await route.invoke();

        expect(res).toEqual({
            sessions: [
                expect.objectContaining({
                    id: "s2",
                    pendingCount: 9,
                    pendingVersion: 10,
                }),
            ],
        });
    });

    it("POST /v1/sessions returns pendingCount + pendingVersion when loading an existing session", async () => {
        const now = new Date(1);
        txSessionFindFirst.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: now,
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 3,
            pendingVersion: 4,
            active: true,
            archivedAt: null,
            lastActiveAt: now,
        });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        const { response: res } = await route.invoke({
            body: { tag: "t1", metadata: "m1", agentState: null, dataEncryptionKey: null },
        });

        expect(sessionFindFirst).not.toHaveBeenCalled();
        expect(txSessionFindFirst).toHaveBeenCalled();
        expect(res).toEqual({
            resolution: "existing",
            session: expect.objectContaining({
                id: "s1",
                pendingCount: 3,
                pendingVersion: 4,
            }),
        });
    });

    it("POST /v1/sessions refreshes intent without asserting reachability for an inactive session", async () => {
        const now = new Date(1);
        const reactivatedAt = 1_000;
        vi.spyOn(Date, "now").mockReturnValueOnce(reactivatedAt);
        txSessionFindFirst.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: now,
            meaningfulActivityAt: now,
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 3,
            pendingBlockedCount: 0,
            pendingVersion: 4,
            latestTurnId: null,
            latestTurnStatus: null,
            latestTurnStatusObservedAt: null,
            lastRuntimeIssue: null,
            active: false,
            archivedAt: null,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });
        txSessionUpdate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: new Date(reactivatedAt),
            meaningfulActivityAt: new Date(reactivatedAt),
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 3,
            pendingBlockedCount: 0,
            pendingVersion: 4,
            latestTurnId: null,
            latestTurnStatus: null,
            latestTurnStatusObservedAt: null,
            lastRuntimeIssue: null,
            active: false,
            archivedAt: null,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });
        getSessionParticipantUserIds.mockResolvedValueOnce(["u1", "u2"]);
        markAccountChanged.mockResolvedValueOnce(101).mockResolvedValueOnce(102);

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        const { response: res } = await route.invoke({
            body: { tag: "t1", metadata: "m1", agentState: null, dataEncryptionKey: null },
        });

        expect(txSessionUpdate).toHaveBeenCalledWith({
            where: { id: "s1" },
            data: {
                meaningfulActivityAt: new Date(reactivatedAt),
            },
        });
        expect(buildUpdateSessionUpdate).toHaveBeenNthCalledWith(1, "s1", 101, expect.any(String), undefined, undefined, {
            meaningfulActivityAt: reactivatedAt,
        });
        expect(buildUpdateSessionUpdate).toHaveBeenNthCalledWith(2, "s1", 102, expect.any(String), undefined, undefined, {
            meaningfulActivityAt: reactivatedAt,
        });
        expect(emitUpdate).toHaveBeenCalledTimes(2);
        expect(buildSessionActivityEphemeral).not.toHaveBeenCalled();
        expect(emitEphemeral).not.toHaveBeenCalled();
        expect(res).toEqual({
            resolution: "existing",
            session: expect.objectContaining({
                id: "s1",
                active: false,
                activeAt: now.getTime(),
                meaningfulActivityAt: reactivatedAt,
                pendingCount: 3,
                pendingVersion: 4,
            }),
        });
    });

    it("POST /v1/sessions unarchives without asserting reachability or replacing its fence", async () => {
        const now = new Date(1);
        const archivedAt = new Date(500);
        const reactivatedAt = 1_000;
        vi.spyOn(Date, "now").mockReturnValueOnce(reactivatedAt);
        txSessionFindFirst.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: now,
            meaningfulActivityAt: now,
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingBlockedCount: 0,
            pendingVersion: 0,
            latestTurnId: null,
            latestTurnStatus: null,
            latestTurnStatusObservedAt: null,
            lastRuntimeIssue: null,
            active: false,
            archivedAt,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });
        txSessionUpdate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: new Date(reactivatedAt),
            meaningfulActivityAt: new Date(reactivatedAt),
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingBlockedCount: 0,
            pendingVersion: 0,
            latestTurnId: null,
            latestTurnStatus: null,
            latestTurnStatusObservedAt: null,
            lastRuntimeIssue: null,
            active: false,
            archivedAt: null,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });
        txSessionUpdateMany.mockResolvedValue({ count: 1 });
        txSessionFindUniqueOrThrow.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s1",
            seq: 1,
            createdAt: now,
            updatedAt: new Date(reactivatedAt),
            meaningfulActivityAt: new Date(reactivatedAt),
            metadata: "m1",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingBlockedCount: 0,
            pendingVersion: 0,
            latestTurnId: null,
            latestTurnStatus: null,
            latestTurnStatusObservedAt: null,
            lastRuntimeIssue: null,
            active: false,
            archivedAt: null,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });
        getSessionParticipantUserIds.mockResolvedValueOnce(["u1"]);
        markAccountChanged.mockResolvedValueOnce(101);

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        const { response: res } = await route.invoke({
            body: { tag: "t1", metadata: "m1", agentState: null, dataEncryptionKey: null },
        });

        expect(txSessionUpdateMany).toHaveBeenCalledWith({
            where: { id: "s1", archivedAt },
            data: {
                archivedAt: null,
                meaningfulActivityAt: new Date(reactivatedAt),
            },
        });
        expect(txSessionUpdate).not.toHaveBeenCalled();
        expect(buildUpdateSessionUpdate).toHaveBeenCalledWith(
            "s1",
            101,
            expect.any(String),
            undefined,
            undefined,
            {
                meaningfulActivityAt: reactivatedAt,
                archivedAt: null,
            },
        );
        expect(res).toEqual({
            resolution: "existing",
            session: expect.objectContaining({
                id: "s1",
                active: false,
                activeAt: now.getTime(),
            }),
        });
    });

    it("POST /v1/sessions returns pendingCount + pendingVersion when creating a new session", async () => {
        const now = new Date(1);
        txSessionFindFirst.mockResolvedValue(null);
        txSessionCreate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s2",
            seq: 2,
            createdAt: now,
            updatedAt: now,
            metadata: "m2",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingVersion: 0,
            active: false,
            lastActiveAt: now,
        });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        const { response: res } = await route.invoke({
            body: { tag: "t2", metadata: "m2", agentState: null, dataEncryptionKey: null },
        });

        expect(sessionFindFirst).not.toHaveBeenCalled();
        expect(txSessionFindFirst).toHaveBeenCalled();
        expect(txSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.not.objectContaining({ active: true }),
        }));
        expect(res).toEqual({
            resolution: "created",
            session: expect.objectContaining({
                id: "s2",
                pendingCount: 0,
                pendingVersion: 0,
                active: false,
            }),
        });
    });

    it("POST /v1/sessions forwards encryptionMode=plain when plaintext storage is optional", async () => {
        resetStoragePolicyEnv({ KAIWU_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional" });

        const now = new Date(1);
        txSessionFindFirst.mockResolvedValue(null);
        txSessionCreate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s2",
            seq: 2,
            createdAt: now,
            updatedAt: now,
            metadata: "m2",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingVersion: 0,
            active: true,
            lastActiveAt: now,
            encryptionMode: "plain",
        });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        await route.invoke({
            body: { tag: "t2", metadata: "m2", agentState: null, dataEncryptionKey: null, encryptionMode: "plain" },
        });

        expect(txSessionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    encryptionMode: "plain",
                }),
            }),
        );
    });

    it("POST /v1/sessions defaults encryptionMode to the account mode when not specified", async () => {
        resetStoragePolicyEnv({ KAIWU_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional" });

        const now = new Date(1);
        txSessionFindFirst.mockResolvedValue(null);
        txAccountFindUnique.mockResolvedValue({ encryptionMode: "plain" });
        txSessionCreate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s2",
            seq: 2,
            createdAt: now,
            updatedAt: now,
            metadata: "m2",
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingVersion: 0,
            active: true,
            lastActiveAt: now,
            encryptionMode: "plain",
        });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        await route.invoke({
            body: { tag: "t2", metadata: "m2", agentState: null, dataEncryptionKey: null },
        });

        expect(txSessionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    encryptionMode: "plain",
                }),
            }),
        );
    });

    it("POST /v1/sessions stores agentState when provided", async () => {
        const now = new Date(1);
        txSessionFindFirst.mockResolvedValue(null);
        txSessionCreate.mockResolvedValue({
            ...runtimeActivityBaseline,
            id: "s2",
            seq: 2,
            createdAt: now,
            updatedAt: now,
            metadata: "m2",
            metadataVersion: 0,
            agentState: "state-1",
            agentStateVersion: 0,
            dataEncryptionKey: null,
            pendingCount: 0,
            pendingVersion: 0,
            active: true,
            lastActiveAt: now,
            encryptionMode: "e2ee",
        });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        await route.invoke({
            body: { tag: "t2", metadata: "m2", agentState: "state-1", dataEncryptionKey: null },
        });

        expect(txSessionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    agentState: "state-1",
                }),
            }),
        );
    });

    it("POST /v1/sessions returns a stable error code when the requested encryptionMode is disallowed by storage policy", async () => {
        resetStoragePolicyEnv({ KAIWU_FEATURE_ENCRYPTION__STORAGE_POLICY: "required_e2ee" });

        const route = await createSessionRouteTestBuilder("POST", "/v1/sessions");
        const { reply } = await route.invoke({
            body: { tag: "t1", metadata: "m1", agentState: null, dataEncryptionKey: null, encryptionMode: "plain" },
        });

        expect(reply.code).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith({
            error: "invalid-params",
            code: "storage_policy_requires_e2ee",
        });
    });
});
