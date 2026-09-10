import { z } from 'zod';
import { AccountSettingsStoredContentEnvelopeSchema } from './accountSettingsStoredContentEnvelope.js';
export const AccountSettingsV2GetResponseSchema = z
    .object({
    content: AccountSettingsStoredContentEnvelopeSchema.nullable(),
    version: z.number().int().min(0),
})
    .strict();
export const AccountSettingsV2UpdateRequestSchema = z
    .object({
    content: AccountSettingsStoredContentEnvelopeSchema.nullable(),
    expectedVersion: z.number().int().min(0),
})
    .strict();
export const AccountSettingsV2UpdateResponseSchema = z.union([
    z.object({
        success: z.literal(true),
        version: z.number().int().min(0),
    }),
    z.object({
        success: z.literal(false),
        error: z.literal('version-mismatch'),
        currentVersion: z.number().int().min(0),
        currentContent: AccountSettingsStoredContentEnvelopeSchema.nullable(),
    }),
]);
//# sourceMappingURL=accountSettingsApiV2.js.map