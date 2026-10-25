import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/storage/db";
import { auth } from "@/app/auth/auth";
import { enableAuthentication } from "@/app/api/utils/enableAuthentication";
import { accountRoutes } from "./accountRoutes";
import { createLightSqliteHarness, type LightSqliteHarness } from "@/testkit/lightSqliteHarness";

describe("Account Deletion (integration)", () => {
    let harness: LightSqliteHarness;

    beforeAll(async () => {
        harness = await createLightSqliteHarness({
            tempDirPrefix: "kaiwu-account-delete-",
            initAuth: true,
            initEncrypt: true,
        });
    }, 120_000);

    afterEach(async () => {
        harness.resetEnv();
        // Clean up any remaining records
        await db.publicShareReport.deleteMany().catch(() => {});
        await db.publicShareAccessLog.deleteMany().catch(() => {});
        await db.publicSessionShare.deleteMany().catch(() => {});
        await db.sessionShareAccessLog.deleteMany().catch(() => {});
        await db.sessionShare.deleteMany().catch(() => {});
        await db.sessionMessage.deleteMany().catch(() => {});
        await db.sessionTurnMutationReceipt.deleteMany().catch(() => {});
        await db.sessionTurn.deleteMany().catch(() => {});
        await db.sessionPendingMessage.deleteMany().catch(() => {});
        await db.sessionSystemRecord.deleteMany().catch(() => {});
        await db.sessionFolderAssignment.deleteMany().catch(() => {});
        await db.sessionTagAssignment.deleteMany().catch(() => {});
        await db.sessionPin.deleteMany().catch(() => {});
        await db.sessionAttentionStanding.deleteMany().catch(() => {});
        await db.usageReport.deleteMany().catch(() => {});
        await db.accessKey.deleteMany().catch(() => {});
        await db.voiceConversation.deleteMany().catch(() => {});
        await db.voiceSessionLease.deleteMany().catch(() => {});
        await db.sessionOrganizationOrderEntry.deleteMany().catch(() => {});
        await db.sessionOrganizationLabel.deleteMany().catch(() => {});
        await db.sessionOrganizationCheckpoint.deleteMany().catch(() => {});
        await db.sessionOrganizationFolder.deleteMany().catch(() => {});
        await db.sessionOrganizationTag.deleteMany().catch(() => {});
        await db.accountChange.deleteMany().catch(() => {});
        await db.session.deleteMany().catch(() => {});
        await db.automationRunEvent.deleteMany().catch(() => {});
        await db.automationRun.deleteMany().catch(() => {});
        await db.automationAssignment.deleteMany().catch(() => {});
        await db.automation.deleteMany().catch(() => {});
        await db.machine.deleteMany().catch(() => {});
        await db.connectedServiceAuthGroupMember.deleteMany().catch(() => {});
        await db.connectedServiceAuthGroup.deleteMany().catch(() => {});
        await db.connectedServiceUsageSource.deleteMany().catch(() => {});
        await db.providerAccountUsageRecord.deleteMany().catch(() => {});
        await db.serviceAccountToken.deleteMany().catch(() => {});
        await db.accountPetAsset.deleteMany().catch(() => {});
        await db.accountPetPackage.deleteMany().catch(() => {});
        await db.artifact.deleteMany().catch(() => {});
        await db.uploadedFile.deleteMany().catch(() => {});
        await db.userRelationship.deleteMany().catch(() => {});
        await db.userFeedItem.deleteMany().catch(() => {});
        await db.userKVStore.deleteMany().catch(() => {});
        await db.terminalAuthRequest.deleteMany().catch(() => {});
        await db.accountAuthRequest.deleteMany().catch(() => {});
        await db.authPairingSession.deleteMany().catch(() => {});
        await db.accountPushToken.deleteMany().catch(() => {});
        await db.accountIdentity.deleteMany().catch(() => {});
        await db.accountSettingsSnapshot.deleteMany().catch(() => {});
        await db.account.deleteMany().catch(() => {});
    });

    afterAll(async () => {
        await harness.close();
    });

    const createTestApp = async () => {
        const app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        const typed = app.withTypeProvider<ZodTypeProvider>() as any;
        enableAuthentication(typed);
        accountRoutes(typed);
        await typed.ready();
        return typed;
    };

    it("creates account, populates data across tables, deletes account, asserts 0 rows, and asserts old token returns 401", async () => {
        const app = await createTestApp();

        try {
            const userId = "test-user-to-delete";
            const friendId = "test-friend-user";

            // 1. Create target user and another user (for relationship)
            await db.account.create({
                data: {
                    id: userId,
                    publicKey: "pub-key-delete-target",
                    firstName: "Delete",
                    lastName: "Me",
                },
            });

            await db.account.create({
                data: {
                    id: friendId,
                    publicKey: "pub-key-friend",
                    firstName: "Friend",
                    lastName: "User",
                },
            });

            // 2. Populate child records across various domains
            const session = await db.session.create({
                data: {
                    id: "sess-delete-1",
                    tag: "tag-1",
                    accountId: userId,
                    metadata: "{}",
                },
            });

            await db.sessionMessage.create({
                data: {
                    id: "msg-delete-1",
                    sessionId: session.id,
                    seq: 1,
                    localId: "loc-1",
                    messageRole: "user",
                    content: { t: "plain", v: "Hello world" },
                },
            });

            await db.machine.create({
                data: {
                    id: "mach-delete-1",
                    accountId: userId,
                    metadata: "{}",
                },
            });

            await db.userKVStore.create({
                data: {
                    id: "kv-delete-1",
                    accountId: userId,
                    key: "some-key",
                    version: 1,
                },
            });

            await db.accountPushToken.create({
                data: {
                    id: "push-delete-1",
                    accountId: userId,
                    token: "push-token-123",
                },
            });

            await db.artifact.create({
                data: {
                    id: "art-delete-1",
                    accountId: userId,
                    header: Buffer.from("test-header"),
                    body: Buffer.from("test-body"),
                    dataEncryptionKey: Buffer.from("test-key"),
                },
            });

            await db.userRelationship.create({
                data: {
                    fromUserId: userId,
                    toUserId: friendId,
                    status: "friend",
                },
            });

            await db.publicSessionShare.create({
                data: {
                    id: "pub-share-1",
                    sessionId: session.id,
                    createdByUserId: userId,
                    tokenHash: Buffer.from("0".repeat(64), "hex"),
                },
            });

            await db.publicShareReport.create({
                data: {
                    id: "report-delete-1",
                    shareToken: "some-token",
                    accountId: userId,
                    reason: "spam",
                },
            });

            // Add automation and pet records to verify cascading cleanup
            const automation = await db.automation.create({
                data: {
                    id: "auto-delete-1",
                    accountId: userId,
                    name: "test-auto",
                    scheduleKind: "cron",
                    scheduleExpr: "* * * * *",
                    targetType: "new_session",
                    templateCiphertext: "test-template-ciphertext",
                },
            });

            const autoRun = await db.automationRun.create({
                data: {
                    id: "autorun-delete-1",
                    automationId: automation.id,
                    accountId: userId,
                    scheduledAt: new Date(),
                    dueAt: new Date(),
                },
            });

            await db.automationRunEvent.create({
                data: {
                    id: "autoevent-delete-1",
                    runId: autoRun.id,
                    type: "started",
                },
            });

            const petPkg = await db.accountPetPackage.create({
                data: {
                    id: "petpkg-delete-1",
                    accountId: userId,
                    packageFormat: "zip",
                    contentMode: "plain",
                    manifest: "{}",
                    digest: "sha256-abc",
                    sizeBytes: 100,
                    origin: "{}",
                },
            });

            await db.accountPetAsset.create({
                data: {
                    id: "petasset-delete-1",
                    accountId: userId,
                    petPackageId: petPkg.id,
                    storageKind: "file",
                    objectKey: "key-1",
                    byteLength: 50,
                    mediaType: "image/png",
                    digest: "sha256-def",
                },
            });

            await db.accountChange.create({
                data: {
                    accountId: userId,
                    kind: "session",
                    entityId: session.id,
                    cursor: 1,
                    sessionId: session.id,
                },
            });

            // 3. Issue real auth token for target user
            const token = await auth.createToken(userId);

            // 4. Verify user can access profile before deletion
            const profileBefore = await app.inject({
                method: "GET",
                url: "/v1/account/profile",
                headers: { authorization: `Bearer ${token}` },
            });
            expect(profileBefore.statusCode).toBe(200);

            // 5. Delete account via DELETE /v1/account
            const deleteResponse = await app.inject({
                method: "DELETE",
                url: "/v1/account",
                headers: { authorization: `Bearer ${token}` },
            });
            expect(deleteResponse.statusCode).toBe(200);
            expect(deleteResponse.json()).toEqual({ success: true });

            // 6. Assert all tables have 0 records for the deleted account
            expect(await db.account.findUnique({ where: { id: userId } })).toBeNull();
            expect(await db.session.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.sessionMessage.count({ where: { sessionId: session.id } })).toBe(0);
            expect(await db.machine.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.userKVStore.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.accountPushToken.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.artifact.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.publicSessionShare.count({ where: { createdByUserId: userId } })).toBe(0);
            expect(await db.publicShareReport.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.automation.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.automationRun.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.automationRunEvent.count({ where: { runId: autoRun.id } })).toBe(0);
            expect(await db.accountPetPackage.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.accountPetAsset.count({ where: { accountId: userId } })).toBe(0);
            expect(await db.accountChange.count({ where: { accountId: userId } })).toBe(0);
            expect(
                await db.userRelationship.count({
                    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
                }),
            ).toBe(0);

            // 7. Verify subsequent request with the same token returns 401
            const profileAfter = await app.inject({
                method: "GET",
                url: "/v1/account/profile",
                headers: { authorization: `Bearer ${token}` },
            });
            expect(profileAfter.statusCode).toBe(401);
            expect(profileAfter.json().code).toBe("account-not-found");
        } finally {
            await app.close();
        }
    });
});
