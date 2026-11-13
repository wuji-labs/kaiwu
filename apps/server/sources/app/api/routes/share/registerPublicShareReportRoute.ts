import { type Fastify } from "../../types";
import { db } from "@/storage/db";
import { z } from "zod";
import { auth } from "@/app/auth/auth";
import { log } from "@/utils/logging/log";
import { resolveApiHotEndpointRateLimit } from "@/app/api/utils/apiRateLimitCatalog";

const PublicShareReportBodySchema = z.object({
    reason: z.string().trim().min(1).max(100),
    details: z.string().trim().max(2000).optional(),
});

async function getOptionalAuthenticatedUserId(request: any): Promise<string | null> {
    const authHeader = request?.headers?.authorization;
    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    try {
        const token = authHeader.substring(7);
        const verified = await auth.verifyToken(token);
        return verified?.userId ?? null;
    } catch {
        return null;
    }
}

export function registerPublicShareReportRoute(app: Fastify): void {
    app.post("/v1/public-share/:token/report", {
        config: {
            rateLimit: resolveApiHotEndpointRateLimit(process.env, "share.public.report"),
        },
        schema: {
            params: z.object({
                token: z.string().min(1),
            }),
            body: PublicShareReportBodySchema,
        },
    }, async (request, reply) => {
        const { token } = request.params;
        const { reason, details } = request.body;
        const reporterAccountId = await getOptionalAuthenticatedUserId(request);

        const report = await db.publicShareReport.create({
            data: {
                shareToken: token,
                accountId: reporterAccountId,
                reason,
                details: details ?? null,
            },
        });

        log(
            {
                module: "public-share-report",
                reportId: report.id,
                shareToken: token,
                reporterAccountId,
                reason,
            },
            "Public share report recorded",
        );

        return reply.code(201).send({ success: true, id: report.id });
    });
}
