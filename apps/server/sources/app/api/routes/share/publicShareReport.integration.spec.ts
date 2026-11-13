import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/storage/db";
import { auth } from "@/app/auth/auth";
import { enableAuthentication } from "@/app/api/utils/enableAuthentication";
import { publicShareRoutes } from "./publicShareRoutes";
import { createLightSqliteHarness, type LightSqliteHarness } from "@/testkit/lightSqliteHarness";

describe("Public Share Report (integration)", () => {
    let harness: LightSqliteHarness;

    beforeAll(async () => {
        harness = await createLightSqliteHarness({
            tempDirPrefix: "kaiwu-share-report-",
            initAuth: true,
            initEncrypt: true,
        });
    }, 120_000);

    afterEach(async () => {
        harness.resetEnv();
        await db.publicShareReport.deleteMany().catch(() => {});
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
        publicShareRoutes(typed);
        await typed.ready();
        return typed;
    };

    it("allows anonymous report submission without auth header", async () => {
        const app = await createTestApp();
        try {
            const res = await app.inject({
                method: "POST",
                url: "/v1/public-share/test-share-token-1/report",
                payload: {
                    reason: "inappropriate_content",
                    details: "Contains offensive text",
                },
            });

            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body.success).toBe(true);
            expect(body.id).toBeDefined();

            const saved = await db.publicShareReport.findUnique({
                where: { id: body.id },
            });
            expect(saved).not.toBeNull();
            expect(saved?.shareToken).toBe("test-share-token-1");
            expect(saved?.reason).toBe("inappropriate_content");
            expect(saved?.details).toBe("Contains offensive text");
            expect(saved?.accountId).toBeNull();
        } finally {
            await app.close();
        }
    });

    it("records reporter accountId when authenticated", async () => {
        const app = await createTestApp();
        try {
            const reporterId = "reporter-user-1";
            await db.account.create({
                data: {
                    id: reporterId,
                    publicKey: "pubkey-reporter",
                },
            });
            const token = await auth.createToken(reporterId);

            const res = await app.inject({
                method: "POST",
                url: "/v1/public-share/test-share-token-2/report",
                headers: { authorization: `Bearer ${token}` },
                payload: {
                    reason: "spam",
                },
            });

            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body.success).toBe(true);

            const saved = await db.publicShareReport.findUnique({
                where: { id: body.id },
            });
            expect(saved).not.toBeNull();
            expect(saved?.shareToken).toBe("test-share-token-2");
            expect(saved?.reason).toBe("spam");
            expect(saved?.details).toBeNull();
            expect(saved?.accountId).toBe(reporterId);
        } finally {
            await app.close();
        }
    });
});
