import { normalizePendingDeliveryBlockedReason } from './pendingDeliveryBlockedReason.js';
export const PENDING_DELIVERY_HIDDEN_DISCARDED_REASONS_V1 = ['resent_as_new'];
const pendingDeliveryHiddenDiscardedReasonsV1 = new Set(PENDING_DELIVERY_HIDDEN_DISCARDED_REASONS_V1);
function readNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function readPendingDeliveryDetailV1(value) {
    return value === 'custody_observed' || value === 'awaiting_acceptance' ? value : null;
}
export function normalizePendingDeliveryStatusV1(fields) {
    if (fields.status === 'discarded') {
        return { status: 'discarded', reason: readNonEmptyString(fields.discardedReason) };
    }
    if (fields.status !== 'queued') {
        return { status: 'queued' };
    }
    if (fields.deliveryState === 'delivering') {
        return { status: 'delivering', detail: 'awaiting_acceptance' };
    }
    if (fields.deliveryState === 'external_handoff') {
        return { status: 'external_handoff' };
    }
    if (fields.deliveryState === 'blocked') {
        return {
            status: 'blocked',
            reason: normalizePendingDeliveryBlockedReason(fields.deliveryBlockedReason) ?? 'unknown',
        };
    }
    return { status: 'queued' };
}
export function parsePendingDeliveryStatusV1(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    if (record.status === 'queued') {
        return { status: 'queued' };
    }
    if (record.status === 'delivering') {
        const detail = readPendingDeliveryDetailV1(record.detail);
        return detail ? { status: 'delivering', detail } : { status: 'delivering' };
    }
    if (record.status === 'external_handoff') {
        return { status: 'external_handoff' };
    }
    if (record.status === 'blocked') {
        return {
            status: 'blocked',
            reason: normalizePendingDeliveryBlockedReason(record.reason) ?? 'unknown',
        };
    }
    if (record.status === 'discarded') {
        return { status: 'discarded', reason: readNonEmptyString(record.reason) };
    }
    return null;
}
export function pendingDeliveryStatusV1ToPersistedFields(status) {
    switch (status.status) {
        case 'queued':
            return { status: 'queued', deliveryState: null, deliveryBlockedReason: null, discardedReason: null };
        case 'delivering':
            return { status: 'queued', deliveryState: 'delivering', deliveryBlockedReason: null, discardedReason: null };
        case 'external_handoff':
            return { status: 'queued', deliveryState: 'external_handoff', deliveryBlockedReason: null, discardedReason: null };
        case 'blocked':
            return {
                status: 'queued',
                deliveryState: 'blocked',
                deliveryBlockedReason: status.reason,
                discardedReason: null,
            };
        case 'discarded':
            return { status: 'discarded', deliveryState: null, deliveryBlockedReason: null, discardedReason: status.reason };
    }
}
export function isPendingDeliveryProviderEffectPossibleV1(status) {
    if (status.status === 'delivering' || status.status === 'external_handoff')
        return true;
    if (status.status !== 'blocked')
        return false;
    return status.reason === 'ambiguous_terminal_delivery'
        || status.reason === 'delivery_outcome_uncertain'
        || status.reason === 'unknown';
}
export function shouldExposePendingDeliveryInDiscardedHistoryV1(status) {
    return status.status === 'discarded'
        && !pendingDeliveryHiddenDiscardedReasonsV1.has(status.reason ?? '');
}
export function isPendingDeliveryStatusTransitionAllowedV1(from, to) {
    if (to.status === 'resolved') {
        if (to.reason === 'provider_accepted') {
            return from.status === 'delivering' || from.status === 'external_handoff' || from.status === 'blocked';
        }
        if (to.reason === 'manual_handled') {
            return from.status === 'delivering' || from.status === 'external_handoff' || from.status === 'blocked';
        }
        return from.status === 'queued';
    }
    if (from.status === to.status) {
        return true;
    }
    if (from.status === 'queued') {
        return to.status === 'delivering' || to.status === 'blocked' || to.status === 'discarded';
    }
    if (from.status === 'delivering') {
        return to.status === 'blocked';
    }
    if (from.status === 'external_handoff') {
        return to.status === 'blocked';
    }
    if (from.status === 'blocked') {
        return to.status === 'queued' || to.status === 'discarded';
    }
    return to.status === 'queued';
}
//# sourceMappingURL=pendingDeliveryStatusV1.js.map