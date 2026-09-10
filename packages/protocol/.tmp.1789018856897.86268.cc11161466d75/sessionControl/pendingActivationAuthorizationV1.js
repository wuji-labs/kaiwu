import { z } from 'zod';
export const PendingActivationFailureCodeV1Schema = z.enum(['runtime_start_failed']);
const PendingActivationAuthorizationBaseV1Schema = z.object({
    requestId: z.string().trim().min(1),
    requestedAt: z.number().int().nonnegative(),
});
export const PendingActivationAuthorizationV1Schema = z.discriminatedUnion('status', [
    PendingActivationAuthorizationBaseV1Schema.extend({ status: z.literal('waiting') }).strict(),
    PendingActivationAuthorizationBaseV1Schema.extend({
        status: z.literal('failed'),
        failureCode: PendingActivationFailureCodeV1Schema,
    }).strict(),
]);
export const PendingActivationFailureRequestV1Schema = z.object({
    requestId: z.string().trim().min(1),
    requestedAt: z.number().int().nonnegative(),
    failureCode: PendingActivationFailureCodeV1Schema,
}).strict();
export const PendingActivationFailureResponseV1Schema = z.object({
    ok: z.literal(true),
    didFail: z.boolean(),
}).strict();
//# sourceMappingURL=pendingActivationAuthorizationV1.js.map