import { z } from "zod";
import { Fastify } from "../../types";
import { db } from "@/storage/db";
import { buildUserProfile } from "@/app/account/profile/userProfile";
import { UserProfileSchema } from "@happier-dev/protocol";

export async function userRoutes(app: Fastify) {
    app.get('/v1/user/:id', {
        schema: {
            params: z.object({
                id: z.string(),
            }),
            response: {
                200: z.object({
                    user: UserProfileSchema,
                }),
                404: z.object({
                    error: z.literal('User not found'),
                }),
            },
        },
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const user = await db.account.findUnique({
            where: { id: request.params.id },
            include: {
                AccountIdentity: {
                    select: { provider: true, providerLogin: true, profile: true, showOnProfile: true },
                    orderBy: { provider: "asc" },
                },
            },
        });

        if (!user) {
            return reply.code(404).send({ error: 'User not found' });
        }

        const identities = user.AccountIdentity.map((identity) => ({
            provider: identity.provider,
            providerLogin: identity.providerLogin ?? null,
            profile: identity.profile,
            showOnProfile: Boolean(identity.showOnProfile),
        }));

        return reply.send({
            user: buildUserProfile(user as Parameters<typeof buildUserProfile>[0], "none", identities),
        });
    });
}
