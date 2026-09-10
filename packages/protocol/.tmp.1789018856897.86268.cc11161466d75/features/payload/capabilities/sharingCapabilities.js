import { z } from 'zod';
export const SharingPendingQueueV2CapabilitiesSchema = z.object({
    deliveryState: z.boolean().optional().default(false),
    deliveryBlockedReason: z.boolean().optional().default(false),
});
export const DEFAULT_SHARING_PENDING_QUEUE_V2_CAPABILITIES = Object.freeze({
    deliveryState: false,
    deliveryBlockedReason: false,
});
export const SharingCapabilitiesSchema = z.object({
    pendingQueueV2: SharingPendingQueueV2CapabilitiesSchema.optional().default(DEFAULT_SHARING_PENDING_QUEUE_V2_CAPABILITIES),
});
export const DEFAULT_SHARING_CAPABILITIES = Object.freeze({
    pendingQueueV2: DEFAULT_SHARING_PENDING_QUEUE_V2_CAPABILITIES,
});
//# sourceMappingURL=sharingCapabilities.js.map