import type { PendingDeliveryBlockedReason } from './pendingDeliveryBlockedReason.js';
export type PendingDeliveryDetailV1 = 'custody_observed' | 'awaiting_acceptance';
export type PendingDeliveryStatusV1 = Readonly<{
    status: 'queued';
}> | Readonly<{
    status: 'delivering';
    detail?: PendingDeliveryDetailV1;
}> | Readonly<{
    status: 'external_handoff';
}> | Readonly<{
    status: 'blocked';
    reason: PendingDeliveryBlockedReason;
}> | Readonly<{
    status: 'discarded';
    reason: string | null;
}>;
export type PendingDeliveryResolvedReasonV1 = 'provider_accepted' | 'materialized' | 'manual_handled';
export declare const PENDING_DELIVERY_HIDDEN_DISCARDED_REASONS_V1: readonly ["resent_as_new"];
export type PendingDeliveryStatusTransitionTargetV1 = PendingDeliveryStatusV1 | Readonly<{
    status: 'resolved';
    reason: 'provider_accepted';
}> | Readonly<{
    status: 'resolved';
    reason: Exclude<PendingDeliveryResolvedReasonV1, 'provider_accepted'>;
}>;
export type PendingDeliveryStatusPersistedFieldsV1 = Readonly<{
    status?: unknown;
    deliveryState?: unknown;
    deliveryBlockedReason?: unknown;
    discardedReason?: unknown;
}>;
export type PendingDeliveryStatusPersistedProjectionV1 = Readonly<{
    status: 'queued' | 'discarded';
    deliveryState: 'delivering' | 'external_handoff' | 'blocked' | null;
    deliveryBlockedReason: PendingDeliveryBlockedReason | null;
    discardedReason: string | null;
}>;
export declare function normalizePendingDeliveryStatusV1(fields: PendingDeliveryStatusPersistedFieldsV1): PendingDeliveryStatusV1;
export declare function parsePendingDeliveryStatusV1(value: unknown): PendingDeliveryStatusV1 | null;
export declare function pendingDeliveryStatusV1ToPersistedFields(status: PendingDeliveryStatusV1): PendingDeliveryStatusPersistedProjectionV1;
export declare function isPendingDeliveryProviderEffectPossibleV1(status: PendingDeliveryStatusV1): boolean;
export declare function shouldExposePendingDeliveryInDiscardedHistoryV1(status: PendingDeliveryStatusV1): boolean;
export declare function isPendingDeliveryStatusTransitionAllowedV1(from: PendingDeliveryStatusV1, to: PendingDeliveryStatusTransitionTargetV1): boolean;
//# sourceMappingURL=pendingDeliveryStatusV1.d.ts.map