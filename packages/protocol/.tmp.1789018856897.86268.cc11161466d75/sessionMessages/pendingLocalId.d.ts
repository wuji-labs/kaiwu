import { z } from 'zod';
/** Pending identity is opaque after admission; validation must never normalize it. */
export declare function isPendingLocalId(value: unknown): value is string;
export declare function readPendingLocalId(value: unknown): string | null;
export declare const PendingLocalIdSchema: any;
export type PendingLocalId = z.infer<typeof PendingLocalIdSchema>;
//# sourceMappingURL=pendingLocalId.d.ts.map