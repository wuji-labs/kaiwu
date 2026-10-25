import { type Fastify } from "../../types";
import { deleteOwnedAccount } from "@/app/account/delete/deleteOwnedAccount";
import { resolveApiHotEndpointRateLimit } from "@/app/api/utils/apiRateLimitCatalog";

export function registerAccountDeleteRoute(app: Fastify): void {
    app.delete("/v1/account", {
        preHandler: app.authenticate,
        config: {
            rateLimit: resolveApiHotEndpointRateLimit(process.env, "account.delete"),
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const result = await deleteOwnedAccount({ accountId: userId });

        if (!result.success) {
            return reply.code(404).send({ error: "Account not found" });
        }

        return reply.send({ success: true });
    });
}
