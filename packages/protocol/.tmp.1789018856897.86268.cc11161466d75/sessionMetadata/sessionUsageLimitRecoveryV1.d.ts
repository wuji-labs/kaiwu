import { z } from 'zod';
export declare const SESSION_USAGE_LIMIT_RECOVERY_STATE_FIELD_ID: "runtime.usageLimitRecovery";
export declare const SESSION_USAGE_LIMIT_RECOVERY_METADATA_KEY: "sessionUsageLimitRecoveryV1";
export declare const SessionUsageLimitRecoveryResumePromptModeV1Schema: any;
export type SessionUsageLimitRecoveryResumePromptModeV1 = z.infer<typeof SessionUsageLimitRecoveryResumePromptModeV1Schema>;
export declare const SessionUsageLimitRecoveryAuthSelectionV1Schema: any;
export type SessionUsageLimitRecoveryAuthSelectionV1 = z.infer<typeof SessionUsageLimitRecoveryAuthSelectionV1Schema>;
export declare const SessionUsageLimitRecoveryV1Schema: any;
export type SessionUsageLimitRecoveryV1 = z.infer<typeof SessionUsageLimitRecoveryV1Schema>;
export declare function resolveSessionUsageLimitRecoveryResumePromptModeV1(input: Readonly<{
    explicit?: unknown;
    existingIntent?: unknown;
    groupPolicy?: unknown;
    accountSettings?: unknown;
}>): SessionUsageLimitRecoveryResumePromptModeV1;
//# sourceMappingURL=sessionUsageLimitRecoveryV1.d.ts.map