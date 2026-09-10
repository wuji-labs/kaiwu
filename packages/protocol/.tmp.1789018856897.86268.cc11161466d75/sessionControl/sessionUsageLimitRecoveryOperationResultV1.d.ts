import { z } from 'zod';
export declare const SESSION_USAGE_LIMIT_RECOVERY_OPERATION_RESULT_OK_STATUSES_V1: readonly ["ready", "waiting", "resumed", "switch_attempted", "switch_applied", "switch_observed", "already_ready", "no_recovery_needed", "cancelled"];
export declare const SESSION_USAGE_LIMIT_RECOVERY_OPERATION_RESULT_ERROR_STATUSES_V1: readonly ["inactive", "exhausted", "cancelled", "rate_limited", "unsupported", "malformed_response", "session_unreachable", "generation_apply_failed", "group_conflict", "not_found"];
export declare const SessionUsageLimitRecoveryOperationResultOkStatusV1Schema: any;
export type SessionUsageLimitRecoveryOperationResultOkStatusV1 = z.infer<typeof SessionUsageLimitRecoveryOperationResultOkStatusV1Schema>;
export declare const SessionUsageLimitRecoveryOperationResultErrorStatusV1Schema: any;
export type SessionUsageLimitRecoveryOperationResultErrorStatusV1 = z.infer<typeof SessionUsageLimitRecoveryOperationResultErrorStatusV1Schema>;
export declare const SessionUsageLimitRecoveryOperationResultV1Schema: any;
export type SessionUsageLimitRecoveryOperationResultV1 = z.infer<typeof SessionUsageLimitRecoveryOperationResultV1Schema>;
export type NormalizeSessionUsageLimitRecoveryOperationResultV1Options = Readonly<{
    sessionId?: string | null;
}>;
export declare function normalizeSessionUsageLimitRecoveryOperationResultV1(value: unknown, options?: NormalizeSessionUsageLimitRecoveryOperationResultV1Options): SessionUsageLimitRecoveryOperationResultV1;
export declare function isSessionUsageLimitRecoveryOperationResultV1(value: unknown): value is SessionUsageLimitRecoveryOperationResultV1;
//# sourceMappingURL=sessionUsageLimitRecoveryOperationResultV1.d.ts.map