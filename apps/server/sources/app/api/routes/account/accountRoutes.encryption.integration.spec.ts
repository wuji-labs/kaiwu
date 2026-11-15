import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/storage/db";
import { createLightSqliteHarness, type LightSqliteHarness } from "@/testkit/lightSqliteHarness";
import { withAuthenticatedTestApp } from "../../testkit/sqliteFastify";
import { registerConnectedServiceCredentialRoutesV2 } from "../connect/connectedServicesV2/registerConnectedServiceCredentialRoutesV2";
import { registerConnectedServiceCredentialRoutesV3 } from "../connect/connectedServicesV3/registerConnectedServiceCredentialRoutesV3";
import { accountRoutes } from "./accountRoutes";

function deferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function installEmptyCredentialCountBarrier(accountId: string): Readonly<{
    countObserved: Promise<void>;
    release: () => void;
    restore: () => void;
}> {
    const countObserved = deferred();
    const releaseCount = deferred();
    let paused = false;

    const pauseAfterTargetCount = async <T>(args: unknown, result: T): Promise<T> => {
        const where = (args as { where?: { accountId?: string } } | undefined)?.where;
        if (!paused && where?.accountId === accountId && result === 0) {
            paused = true;
            countObserved.resolve();
            await releaseCount.promise;
        }
        return result;
    };

    // This test-only scheduler wraps the real Prisma boundary so the route still performs real DB work.
    const mutableDb = db as any;
    const directDelegate = mutableDb.serviceAccountToken;
    const originalDirectCount = directDelegate.count;
    const originalTransaction = mutableDb.$transaction;

    directDelegate.count = async (args: unknown) => {
        return await pauseAfterTargetCount(args, await originalDirectCount.call(directDelegate, args));
    };
    mutableDb.$transaction = async (operation: unknown, options: unknown) => {
        if (typeof operation !== "function") {
            return await originalTransaction.call(mutableDb, operation, options);
        }
        return await originalTransaction.call(mutableDb, async (tx: any) => {
            const transactionDelegate = tx.serviceAccountToken;
            const originalTransactionCount = transactionDelegate.count.bind(transactionDelegate);
            const wrappedDelegate = new Proxy(transactionDelegate, {
                get(target, property, receiver) {
                    if (property === "count") {
                        return async (args: unknown) => {
                            return await pauseAfterTargetCount(args, await originalTransactionCount(args));
                        };
                    }
                    return Reflect.get(target, property, receiver);
                },
            });
            const wrappedTx = new Proxy(tx, {
                get(target, property, receiver) {
                    if (property === "serviceAccountToken") return wrappedDelegate;
                    return Reflect.get(target, property, receiver);
                },
            });
            return await operation(wrappedTx);
        }, options);
    };

    return {
        countObserved: countObserved.promise,
        release: releaseCount.resolve,
        restore: () => {
            releaseCount.resolve();
            directDelegate.count = originalDirectCount;
            mutableDb.$transaction = originalTransaction;
        },
    };
}

function installAccountModeReadBarrier(accountId: string): Readonly<{
    modeObserved: Promise<void>;
    release: () => void;
    restore: () => void;
}> {
    const modeObserved = deferred();
    const releaseRead = deferred();
    let paused = false;
    const mutableDb = db as any;
    const accountDelegate = mutableDb.account;
    const originalFindUnique = accountDelegate.findUnique;

    accountDelegate.findUnique = async (args: unknown) => {
        const result = await originalFindUnique.call(accountDelegate, args);
        const query = args as { where?: { id?: string }; select?: { encryptionMode?: boolean } } | undefined;
        if (!paused && query?.where?.id === accountId && query.select?.encryptionMode === true) {
            paused = true;
            modeObserved.resolve();
            await releaseRead.promise;
        }
        return result;
    };

    return {
        modeObserved: modeObserved.promise,
        release: releaseRead.resolve,
        restore: () => {
            releaseRead.resolve();
            accountDelegate.findUnique = originalFindUnique;
        },
    };
}

describe("accountRoutes (encryption mode integration)", () => {
    let harness: LightSqliteHarness;

    beforeAll(async () => {
        harness = await createLightSqliteHarness({
            tempDirPrefix: "happier-account-encryption-",
            initAuth: false,
            env: { HAPPIER_SQLITE_CONNECTION_LIMIT: "2" },
        });
    }, 120_000);

    afterAll(async () => {
        await harness.close();
    });

    beforeEach(() => {
        vi.resetModules();
        harness.resetEnv();
    });

    afterEach(async () => {
        harness.resetEnv();
        await harness.resetDbTables([
            () => db.accountChange.deleteMany(),
            () => db.serviceAccountToken.deleteMany(),
            () => db.automation.deleteMany(),
            () => db.repeatKey.deleteMany(),
            () => db.account.deleteMany(),
        ]);
    });

    it("GET /v1/account/encryption returns account encryption mode", async () => {
        const account = await db.account.create({
            data: {
                publicKey: "pk-account-encryption-get",
                encryptionMode: "e2ee",
                encryptionModeUpdatedAt: new Date("2026-02-17T10:00:00.000Z"),
            },
            select: { id: true },
        });

        await withAuthenticatedTestApp(
            (app) => accountRoutes(app as any),
            async (app) => {
                const res = await app.inject({
                    method: "GET",
                    url: "/v1/account/encryption",
                    headers: { "x-test-user-id": account.id },
                });

                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ mode: "e2ee", updatedAt: 1771322400000 });
            },
        );
    });

    it("PATCH /v1/account/encryption returns 404 when account opt-out is disabled", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "0",
        });

        const account = await db.account.create({
            data: { publicKey: "pk-account-encryption-optout-disabled", encryptionMode: "e2ee" },
            select: { id: true },
        });

        await withAuthenticatedTestApp(
            (app) => accountRoutes(app as any),
            async (app) => {
                const res = await app.inject({
                    method: "PATCH",
                    url: "/v1/account/encryption",
                    headers: { "content-type": "application/json", "x-test-user-id": account.id },
                    payload: { mode: "plain" },
                });

                expect(res.statusCode).toBe(404);
                expect(res.json()).toEqual({ error: "not_found" });
            },
        );

        const stored = await db.account.findUnique({
            where: { id: account.id },
            select: { encryptionMode: true },
        });
        expect(stored?.encryptionMode).toBe("e2ee");
    });

    it("PATCH /v1/account/encryption updates the account mode when account opt-out is enabled", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "1",
        });

        const account = await db.account.create({
            data: {
                publicKey: "pk-account-encryption-update",
                encryptionMode: "e2ee",
                encryptionModeUpdatedAt: new Date("2026-02-17T10:00:00.000Z"),
            },
            select: { id: true },
        });

        await withAuthenticatedTestApp(
            (app) => accountRoutes(app as any),
            async (app) => {
                const res = await app.inject({
                    method: "PATCH",
                    url: "/v1/account/encryption",
                    headers: { "content-type": "application/json", "x-test-user-id": account.id },
                    payload: { mode: "plain" },
                });

                expect(res.statusCode).toBe(200);
                expect(res.json()).toMatchObject({ mode: "plain", updatedAt: expect.any(Number) });
            },
        );

        const stored = await db.account.findUnique({
            where: { id: account.id },
            select: { encryptionMode: true, encryptionModeUpdatedAt: true },
        });
        expect(stored?.encryptionMode).toBe("plain");
        expect(stored?.encryptionModeUpdatedAt?.getTime()).toBeGreaterThan(1771322400000);
    });

    it("PATCH /v1/account/encryption preserves the internal response for a missing account", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "1",
        });

        await withAuthenticatedTestApp(
            (app) => accountRoutes(app as any),
            async (app) => {
                const res = await app.inject({
                    method: "PATCH",
                    url: "/v1/account/encryption",
                    headers: { "content-type": "application/json", "x-test-user-id": "missing-account" },
                    payload: { mode: "plain" },
                });

                expect(res.statusCode).toBe(500);
                expect(res.json()).toEqual({ error: "internal" });
            },
        );
    });

    it("PATCH /v1/account/encryption rejects mode flips that require migration", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "1",
        });

        const account = await db.account.create({
            data: {
                publicKey: "pk-account-encryption-migration-required",
                encryptionMode: "e2ee",
                encryptionModeUpdatedAt: new Date("2026-02-17T10:00:00.000Z"),
                settings: "cipher",
            },
            select: { id: true },
        });

        await withAuthenticatedTestApp(
            (app) => accountRoutes(app as any),
            async (app) => {
                const res = await app.inject({
                    method: "PATCH",
                    url: "/v1/account/encryption",
                    headers: { "content-type": "application/json", "x-test-user-id": account.id },
                    payload: { mode: "plain" },
                });

                expect(res.statusCode).toBe(400);
                expect(res.json()).toEqual({ error: "migration-required" });
            },
        );

        const stored = await db.account.findUnique({
            where: { id: account.id },
            select: { encryptionMode: true, settings: true },
        });
        expect(stored?.encryptionMode).toBe("e2ee");
        expect(stored?.settings).toBe("cipher");
    });

    it("serializes a mode PATCH against a first V2 credential write", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "1",
        });

        const account = await db.account.create({
            data: { publicKey: "pk-account-encryption-race", encryptionMode: "e2ee" },
            select: { id: true },
        });

        await withAuthenticatedTestApp(
            (app) => {
                accountRoutes(app as any);
                registerConnectedServiceCredentialRoutesV2(app as any, { credentialMaxLen: 1024 });
            },
            async (app) => {
                const barrier = installEmptyCredentialCountBarrier(account.id);
                try {
                    const modePatch = app.inject({
                        method: "PATCH",
                        url: "/v1/account/encryption",
                        headers: { "content-type": "application/json", "x-test-user-id": account.id },
                        payload: { mode: "plain" },
                    });
                    await barrier.countObserved;

                    const credentialWritePromise = app.inject({
                        method: "POST",
                        url: "/v2/connect/openai-codex/profiles/work/credential",
                        headers: { "content-type": "application/json", "x-test-user-id": account.id },
                        payload: {
                            sealed: { format: "account_scoped_v1", ciphertext: "c2VhbGVk" },
                            metadata: { kind: "oauth", providerEmail: "race@example.com" },
                        },
                    });
                    await Promise.race([
                        credentialWritePromise.then(() => undefined),
                        new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
                    ]);

                    barrier.release();
                    const [credentialWrite, modeResult] = await Promise.all([credentialWritePromise, modePatch]);
                    expect([credentialWrite.statusCode, modeResult.statusCode].sort()).toEqual([200, 400]);
                    if (credentialWrite.statusCode === 400) {
                        expect(credentialWrite.json()).toEqual({ error: "connect_credential_invalid" });
                    } else {
                        expect(modeResult.json()).toEqual({ error: "migration-required" });
                    }
                } finally {
                    barrier.restore();
                }
            },
        );

        const storedAccount = await db.account.findUniqueOrThrow({
            where: { id: account.id },
            select: { encryptionMode: true },
        });
        const storedCredential = await db.serviceAccountToken.findUnique({
            where: {
                accountId_vendor_profileId: {
                    accountId: account.id,
                    vendor: "openai-codex",
                    profileId: "work",
                },
            },
            select: { metadata: true },
        });
        if (storedAccount.encryptionMode === "plain") {
            expect(storedCredential).toBeNull();
        } else {
            expect(storedCredential?.metadata).toMatchObject({ v: 2, format: "account_scoped_v1" });
        }
    });

    it("rejects a mode PATCH after a first V3 credential write wins", async () => {
        harness.resetEnv({
            HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: "optional",
            HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: "1",
            HAPPIER_FEATURE_ENCRYPTION__PLAIN_ACCOUNT_CREDENTIALS_AT_REST: "none",
        });

        const account = await db.account.create({
            data: { publicKey: "pk-account-encryption-v3-winner", encryptionMode: "plain" },
            select: { id: true },
        });
        const now = Date.now();

        await withAuthenticatedTestApp(
            (app) => {
                accountRoutes(app as any);
                registerConnectedServiceCredentialRoutesV3(app as any);
            },
            async (app) => {
                const credentialWrite = await app.inject({
                    method: "POST",
                    url: "/v3/connect/openai-codex/profiles/work/credential",
                    headers: { "content-type": "application/json", "x-test-user-id": account.id },
                    payload: {
                        content: {
                            t: "plain",
                            v: {
                                v: 1,
                                serviceId: "openai-codex",
                                profileId: "work",
                                kind: "token",
                                createdAt: now,
                                updatedAt: now,
                                expiresAt: null,
                                oauth: null,
                                token: {
                                    token: "plain-token",
                                    providerAccountId: null,
                                    providerEmail: "v3-race@example.com",
                                    raw: null,
                                },
                            },
                        },
                    },
                });
                expect(credentialWrite.statusCode).toBe(200);

                const modePatch = await app.inject({
                    method: "PATCH",
                    url: "/v1/account/encryption",
                    headers: { "content-type": "application/json", "x-test-user-id": account.id },
                    payload: { mode: "e2ee" },
                });
                expect(modePatch.statusCode).toBe(400);
                expect(modePatch.json()).toEqual({ error: "migration-required" });
            },
        );

        const storedAccount = await db.account.findUniqueOrThrow({
            where: { id: account.id },
            select: { encryptionMode: true },
        });
        const storedCredential = await db.serviceAccountToken.findUniqueOrThrow({
            where: {
                accountId_vendor_profileId: {
                    accountId: account.id,
                    vendor: "openai-codex",
                    profileId: "work",
                },
            },
            select: { metadata: true },
        });
        expect(storedAccount.encryptionMode).toBe("plain");
        expect(storedCredential.metadata).toMatchObject({ v: 3, storage: "plain_json_v1" });
    });
});
