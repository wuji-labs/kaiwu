import { z } from 'zod';
/**
 * The single server-owned action persisted on one Pending row.
 *
 * The row already owns sessionId + localId, so this value deliberately carries no selector.
 */
export declare const PendingRequestedActionV1Schema: any;
export type PendingRequestedActionV1 = z.infer<typeof PendingRequestedActionV1Schema>;
//# sourceMappingURL=pendingRequestedActionV1.d.ts.map