import { z } from "zod";
import { db } from "@/storage/db";
import { Context } from "@/context";
import { UsernameTakenError, usernameUpdate } from "@/app/account/username/usernameUpdate";
import { isServerFeatureEnabledForRequest } from "@/app/features/catalog/serverFeatureGate";
import { validateUsername } from "@/app/account/username/usernamePolicy";
import { type Fastify } from "../../types";

export function registerAccountUsernameRoute(app: Fastify): void {
    app.post('/v1/account/username', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                username: z.string(),
            }),
            response: {
                200: z.object({ username: z.string() }),
                400: z.object({ error: z.enum(['invalid-username', 'username-disabled', 'friends-disabled']) }),
                409: z.object({ error: z.literal('username-taken') }),
            },
        },
    }, async (request, reply) => {
        if (!isServerFeatureEnabledForRequest("social.friends", process.env)) {
            return reply.code(400).send({ error: 'friends-disabled' });
        }

        const validation = validateUsername(request.body.username, process.env);
        if (!validation.ok) {
            return reply.code(400).send({ error: 'invalid-username' });
        }
        const username = validation.username;

        // Fast pre-check for friendlier errors; rely on unique index as final arbiter.
        const existing = await db.account.findFirst({
            where: {
                username,
                NOT: { id: request.userId },
            },
            select: { id: true },
        });
        if (existing) {
            return reply.code(409).send({ error: 'username-taken' });
        }

        try {
            await usernameUpdate(Context.create(request.userId), username);
        } catch (e) {
            if (e instanceof UsernameTakenError) {
                return reply.code(409).send({ error: 'username-taken' });
            }
            throw e;
        }

        return reply.send({ username });
    });
}
