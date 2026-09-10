import { z } from 'zod';
export const ServerRetentionDomainPolicyV2Schema = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('keep_forever') }),
    z.strictObject({ mode: z.literal('delete_older_than'), days: z.number().int().min(1) }),
    z.strictObject({ mode: z.literal('delete_inactive'), inactivityDays: z.number().int().min(1) }),
]);
export const ServerRetentionDomainV2Schema = z.strictObject({
    id: z.string().trim().min(1),
    policy: ServerRetentionDomainPolicyV2Schema,
});
export const ServerRetentionPolicyV2Schema = z.strictObject({
    version: z.literal(2),
    enabled: z.boolean(),
    complete: z.literal(true),
    domains: z.array(ServerRetentionDomainV2Schema),
});
//# sourceMappingURL=serverRetentionPolicyV2.js.map