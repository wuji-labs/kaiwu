import { z } from 'zod';
import type { PendingProviderAction } from './pendingProviderAction.js';
import type { PendingRequestedActionV1 } from './pendingRequestedActionV1.js';
export declare const PENDING_DELIVERY_BLOCKED_REASONS: readonly ["terminal_composer_draft", "runtime_config_blocked", "delivery_outcome_uncertain", "provider_unavailable_before_acceptance", "ambiguous_terminal_delivery", "terminal_host_unreachable", "runtime_disposed_before_delivery", "invalid_prompt_text", "manual_user_handled", "attempt_expired_before_write", "provider_rejected_before_acceptance", "steering_unavailable", "conditional_steer_unavailable", "unsupported_action", "payload_too_large", "unknown"];
export declare const PendingDeliveryBlockedReasonSchema: any;
export type PendingDeliveryBlockedReason = z.infer<typeof PendingDeliveryBlockedReasonSchema>;
export declare function isPendingDeliveryBlockedReason(value: unknown): value is PendingDeliveryBlockedReason;
export declare function normalizePendingDeliveryBlockedReason(value: unknown): PendingDeliveryBlockedReason | null;
export declare function isConditionalPendingSteerClaim(params: Readonly<{
    requestedAction: PendingRequestedActionV1 | null | undefined;
    providerAction: PendingProviderAction | null | undefined;
}>): boolean;
//# sourceMappingURL=pendingDeliveryBlockedReason.d.ts.map