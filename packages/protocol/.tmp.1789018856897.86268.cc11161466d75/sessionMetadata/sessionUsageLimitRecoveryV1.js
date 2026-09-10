import { z } from 'zod';
import { ConnectedServiceAuthGroupIdSchema, ConnectedServiceIdSchema, ConnectedServiceProfileIdSchema, ConnectedServiceQuotaRecoveryCreditsV1Schema, } from '../connect/connectedServiceSchemas.js';
export const SESSION_USAGE_LIMIT_RECOVERY_STATE_FIELD_ID = 'runtime.usageLimitRecovery';
export const SESSION_USAGE_LIMIT_RECOVERY_METADATA_KEY = 'sessionUsageLimitRecoveryV1';
export const SessionUsageLimitRecoveryResumePromptModeV1Schema = z.enum(['standard', 'off', 'custom']);
const SessionUsageLimitRecoveryProfileAuthSelectionV1Schema = z
    .object({
    kind: z.literal('profile'),
    serviceId: ConnectedServiceIdSchema,
    profileId: ConnectedServiceProfileIdSchema,
})
    .strict();
const SessionUsageLimitRecoveryGroupAuthSelectionV1Schema = z
    .object({
    kind: z.literal('group'),
    serviceId: ConnectedServiceIdSchema,
    groupId: ConnectedServiceAuthGroupIdSchema,
    profileId: ConnectedServiceProfileIdSchema.nullable(),
})
    .strict();
const SessionUsageLimitRecoveryNativeAuthSelectionV1Schema = z
    .object({
    kind: z.literal('native'),
    serviceId: ConnectedServiceIdSchema.nullable().optional(),
})
    .strict();
export const SessionUsageLimitRecoveryAuthSelectionV1Schema = z.discriminatedUnion('kind', [
    SessionUsageLimitRecoveryNativeAuthSelectionV1Schema,
    SessionUsageLimitRecoveryProfileAuthSelectionV1Schema,
    SessionUsageLimitRecoveryGroupAuthSelectionV1Schema,
]);
export const SessionUsageLimitRecoveryV1Schema = z
    .object({
    v: z.literal(1),
    status: z.enum(['armed', 'waiting', 'checking', 'paused', 'exhausted', 'cancelled']),
    issueFingerprint: z.string().trim().min(1),
    armedAtMs: z.number().int().nonnegative(),
    runtimeAuthRecoveryAttemptId: z.string().trim().min(1).optional(),
    resetAtMs: z.number().int().nonnegative().nullable(),
    nextCheckAtMs: z.number().int().nonnegative().nullable(),
    attemptCount: z.number().int().nonnegative(),
    maxAttempts: z.number().int().nonnegative(),
    lastProbeError: z.string().trim().min(1).nullable(),
    resumePromptMode: SessionUsageLimitRecoveryResumePromptModeV1Schema.default('standard'),
    selectedAuth: SessionUsageLimitRecoveryAuthSelectionV1Schema,
    recoveryCredits: ConnectedServiceQuotaRecoveryCreditsV1Schema.optional(),
})
    .strict();
function readRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function readResumePromptMode(value) {
    const parsed = SessionUsageLimitRecoveryResumePromptModeV1Schema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
function readAccountSettingsResumePromptMode(value) {
    const accountSettings = readRecord(value);
    if (!accountSettings)
        return null;
    const nestedSettings = readRecord(accountSettings.usageLimitRecoverySettingsV1);
    return readResumePromptMode(nestedSettings?.resumePromptMode)
        ?? readResumePromptMode(accountSettings.resumePromptMode);
}
export function resolveSessionUsageLimitRecoveryResumePromptModeV1(input) {
    const existingIntent = readRecord(input.existingIntent);
    const groupPolicy = readRecord(input.groupPolicy);
    return readResumePromptMode(input.explicit)
        ?? readResumePromptMode(existingIntent?.resumePromptMode)
        ?? readResumePromptMode(groupPolicy?.resumePromptMode)
        ?? readAccountSettingsResumePromptMode(input.accountSettings)
        ?? 'standard';
}
//# sourceMappingURL=sessionUsageLimitRecoveryV1.js.map