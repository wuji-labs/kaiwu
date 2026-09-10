import { z } from 'zod';
/**
 * The single server-owned action persisted on one Pending row.
 *
 * The row already owns sessionId + localId, so this value deliberately carries no selector.
 */
export const PendingRequestedActionV1Schema = z.object({
    v: z.literal(1),
    kind: z.enum(['enqueue', 'steer_if_active', 'steer_now', 'send_now']),
}).strict();
//# sourceMappingURL=pendingRequestedActionV1.js.map