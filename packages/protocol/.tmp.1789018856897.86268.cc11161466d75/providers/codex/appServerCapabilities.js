import { z } from 'zod';
export const CodexAppServerCapabilitiesSchema = z
    .object({
    goals: z.boolean().optional(),
    vendorPlugins: z.boolean().optional(),
    skills: z.boolean().optional(),
    structuredInput: z.boolean().optional(),
    permissionProfiles: z.boolean().optional(),
})
    .passthrough();
//# sourceMappingURL=appServerCapabilities.js.map