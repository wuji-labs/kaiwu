import { z } from 'zod';
import { SESSION_ORGANIZATION_MAX_ID_LENGTH } from './constants.js';
const SessionOrganizationSessionIdSchema = z.string().trim().min(1).max(SESSION_ORGANIZATION_MAX_ID_LENGTH);
export const SessionAttentionStandingSchema = z
    .object({
    sessionId: SessionOrganizationSessionIdSchema,
    standing: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
})
    .strict();
export const SetSessionAttentionStandingRequestSchema = z
    .object({
    standing: z.boolean().nullable(),
})
    .strict();
export const SetSessionAttentionStandingResponseSchema = z
    .object({
    standing: SessionAttentionStandingSchema.nullable(),
})
    .strict();
//# sourceMappingURL=standings.js.map