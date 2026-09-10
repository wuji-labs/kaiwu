import { z } from 'zod';
/** Pending identity is opaque after admission; validation must never normalize it. */
export function isPendingLocalId(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
export function readPendingLocalId(value) {
    return isPendingLocalId(value) ? value : null;
}
export const PendingLocalIdSchema = z.string().refine(isPendingLocalId, {
    message: 'Pending localId must not be blank',
});
//# sourceMappingURL=pendingLocalId.js.map