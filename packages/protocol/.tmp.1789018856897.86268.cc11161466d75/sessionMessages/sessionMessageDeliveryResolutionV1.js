import { z } from 'zod';
export const SessionMessageDeliveryResolutionV1Schema = z.object({
    v: z.literal(1),
    kind: z.literal('manual_handled'),
}).strict();
//# sourceMappingURL=sessionMessageDeliveryResolutionV1.js.map