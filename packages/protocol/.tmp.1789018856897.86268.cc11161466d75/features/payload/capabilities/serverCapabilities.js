import { z } from 'zod';
import { ServerRetentionCapabilitiesSchema } from './serverRetentionCapabilities.js';
const OptionalNonEmptyString = z.string().trim().min(1).optional();
export const ServerCapabilitiesSchema = z
    .object({
    canonicalServerUrl: OptionalNonEmptyString,
    webappUrl: OptionalNonEmptyString,
    retention: ServerRetentionCapabilitiesSchema.optional(),
})
    .strict();
export const DEFAULT_SERVER_CAPABILITIES = {};
//# sourceMappingURL=serverCapabilities.js.map