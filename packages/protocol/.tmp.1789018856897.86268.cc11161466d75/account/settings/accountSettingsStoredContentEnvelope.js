import { z } from 'zod';
import { AccountSettingsPersistedObjectSchema } from './accountSettingsPersistedObject.js';
export const AccountSettingsStoredContentEnvelopeSchema = z.discriminatedUnion('t', [
    z.object({
        t: z.literal('plain'),
        v: AccountSettingsPersistedObjectSchema,
    }),
    z.object({
        t: z.literal('encrypted'),
        c: z.string().min(1),
    }),
]);
//# sourceMappingURL=accountSettingsStoredContentEnvelope.js.map