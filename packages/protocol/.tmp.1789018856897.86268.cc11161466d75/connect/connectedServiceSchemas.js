import { z } from 'zod';
import { ConnectedServiceLimitCategoryV1Schema, } from './connectedServiceLimitCategory.js';
import { ConnectedServiceAuthGroupIdSchema, ConnectedServiceIdSchema, ConnectedServiceProfileIdSchema, } from './connectedServiceBindings.js';
export { ConnectedServiceAuthGroupIdSchema, ConnectedServiceBindingSelectionV1Schema, ConnectedServiceBindingsV1Schema, ConnectedServiceIdSchema, ConnectedServiceProfileIdSchema, SessionConnectedServiceAuthSwitchRpcParamsSchema, } from './connectedServiceBindings.js';
export const ConnectedServiceCredentialFormatSchema = z.enum(['account_scoped_v1']);
export const ConnectedServiceCredentialKindSchema = z.enum(['oauth', 'token']);
export const ConnectedServiceCredentialHealthStatusV1Schema = z.enum([
    'connected',
    'refreshing',
    'needs_reauth',
    'refresh_failed_retryable',
]);
export function normalizeConnectedServiceCredentialHealthStatus(raw) {
    if (raw === 'connected')
        return 'connected';
    if (raw === 'refreshing')
        return 'refreshing';
    if (raw === 'refresh_failed_retryable')
        return 'refresh_failed_retryable';
    return 'needs_reauth';
}
export function isConnectedServiceCredentialHealthStatusReconnectRequired(status) {
    return status === 'needs_reauth';
}
export function isConnectedServiceCredentialHealthStatusUsable(status) {
    return status === 'connected'
        || status === 'refreshing'
        || status === 'refresh_failed_retryable';
}
export const ConnectedServiceCredentialRefreshFailureKindV1Schema = z.enum([
    'invalid_grant',
    'invalid_client',
    'provider_401',
    'provider_403',
    'network_error',
    'malformed_response',
    'missing_access_token',
    'missing_refresh_token',
    'unknown',
]);
export const ConnectedServiceCredentialHealthV1Schema = z.object({
    v: z.literal(1),
    status: ConnectedServiceCredentialHealthStatusV1Schema,
    reconnectRequired: z.boolean().default(false),
    lastRefreshAttemptAt: z.number().int().nonnegative().optional(),
    lastRefreshSuccessAt: z.number().int().nonnegative().optional(),
    lastRefreshFailureAt: z.number().int().nonnegative().optional(),
    lastRefreshFailureKind: ConnectedServiceCredentialRefreshFailureKindV1Schema.optional(),
    lastRuntimeAuthFailureAt: z.number().int().nonnegative().optional(),
    providerHttpStatus: z.number().int().min(100).max(599).optional(),
    providerErrorCode: z.string().trim().min(1).max(128).optional(),
}).strict();
/**
 * Opaque server-owned revision for one connected-service credential value.
 * It is intentionally independent from row timestamps and refresh-lease bookkeeping.
 */
export const ConnectedServiceCredentialRevisionV1Schema = z
    .string()
    .regex(/^csr_[A-Za-z0-9_-]{22,64}$/);
export const ConnectedServiceExecutionAuthorityV1Schema = z.enum([
    'passive_projection',
    'fresh_user_action',
    'runtime_recovery',
]);
export const ConnectedServiceCredentialMutationGuardV1Schema = z.object({
    expectedCredentialRevision: ConnectedServiceCredentialRevisionV1Schema.nullable().optional(),
    refreshLeaseOwnerId: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((value, context) => {
    if (value.refreshLeaseOwnerId && typeof value.expectedCredentialRevision !== 'string') {
        context.addIssue({
            code: 'custom',
            message: 'refreshLeaseOwnerId requires expectedCredentialRevision',
            path: ['expectedCredentialRevision'],
        });
    }
});
export const ConnectedServiceCredentialRevisionedMutationSuccessV1Schema = z.object({
    success: z.literal(true),
    credentialRevision: ConnectedServiceCredentialRevisionV1Schema,
}).strict();
export const ConnectedServiceCredentialLegacyMutationSuccessV1Schema = z.object({
    success: z.literal(true),
}).strict();
export const ConnectedServiceCredentialMutationSuccessV1Schema = ConnectedServiceCredentialRevisionedMutationSuccessV1Schema;
export const ConnectedServiceCredentialCompatibleMutationSuccessV1Schema = z.union([
    ConnectedServiceCredentialRevisionedMutationSuccessV1Schema,
    ConnectedServiceCredentialLegacyMutationSuccessV1Schema,
]);
/**
 * Translates the exact server-v0.2.1 no-revision shape from
 * 4913c1e533c872a0712ba1c25b3104fd470aacc2 into an explicit unfenced semantic
 * state. A missing revision must never be treated as a successful CAS fence.
 * Remove the legacy branch when exact 0.2.1 leaves the supported predecessor window.
 */
export function readConnectedServiceCredentialRevisionBoundaryV1(value) {
    if (!('credentialRevision' in value)) {
        return { revisionSemantics: 'legacy_unfenced', credentialRevision: null };
    }
    const parsed = ConnectedServiceCredentialRevisionV1Schema.safeParse(value.credentialRevision);
    if (!parsed.success)
        return null;
    return { revisionSemantics: 'revisioned', credentialRevision: parsed.data };
}
export const ConnectedServiceCredentialMutationSupersededV1Schema = z.object({
    error: z.literal('connect_credential_mutation_superseded'),
    reason: z.enum(['revision_mismatch', 'refresh_lease_lost']),
    credentialRevision: ConnectedServiceCredentialRevisionV1Schema.nullable(),
}).strict();
export const ConnectedServiceCredentialMutationResponseV1Schema = z.union([
    ConnectedServiceCredentialMutationSuccessV1Schema,
    ConnectedServiceCredentialMutationSupersededV1Schema,
]);
export const ConnectedServiceCredentialCompatibleMutationResponseV1Schema = z.union([
    ConnectedServiceCredentialCompatibleMutationSuccessV1Schema,
    ConnectedServiceCredentialMutationSupersededV1Schema,
]);
const OauthCredentialPayloadSchema = z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    idToken: z.string().min(1).nullable(),
    scope: z.string().min(1).nullable(),
    tokenType: z.string().min(1).nullable(),
    providerAccountId: z.string().min(1).nullable(),
    providerEmail: z.string().min(1).nullable(),
    raw: z.unknown().nullable(),
});
const TokenCredentialPayloadSchema = z.object({
    token: z.string().min(1),
    providerAccountId: z.string().min(1).nullable(),
    providerEmail: z.string().min(1).nullable(),
    raw: z.unknown().nullable(),
});
const ConnectedServiceCredentialBaseSchema = z.object({
    v: z.literal(1),
    serviceId: ConnectedServiceIdSchema,
    profileId: ConnectedServiceProfileIdSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative().nullable(),
});
export const ConnectedServiceCredentialRecordV1Schema = z.discriminatedUnion('kind', [
    ConnectedServiceCredentialBaseSchema.extend({
        kind: z.literal('oauth'),
        oauth: OauthCredentialPayloadSchema,
        token: z.null(),
    }),
    ConnectedServiceCredentialBaseSchema.extend({
        kind: z.literal('token'),
        oauth: z.null(),
        token: TokenCredentialPayloadSchema,
    }),
]);
export const SealedConnectedServiceCredentialV1Schema = z.object({
    format: ConnectedServiceCredentialFormatSchema,
    ciphertext: z.string().min(1),
});
export const ConnectedServiceQuotaUnitV1Schema = z.enum([
    'count',
    'tokens',
    'credits',
    'usd',
    'requests',
    'unknown',
]);
export const ConnectedServiceQuotaSourceV1Schema = z.enum([
    'provider_api',
    'background_fetch',
    'runtime_event',
    'runtime_probe',
    'in_band_snapshot',
    'in_band_provider_snapshot',
    'manual_refresh',
    'user_probe',
    'cached',
    'unknown',
]);
export const ConnectedServiceQuotaConfidenceV1Schema = z.enum(['exact', 'derived', 'estimated', 'stale', 'unknown']);
export const ConnectedServiceQuotaRecoveryCreditKindV1Schema = z.enum([
    'usage_limit_reset',
    'rate_limit_reset',
    'quota_reset',
    'unknown',
]);
export const ConnectedServiceQuotaRecoveryCreditStatusV1Schema = z.enum([
    'available',
    'redeeming',
    'redeemed',
    'expired',
    'unknown',
]);
export const ConnectedServiceQuotaRecoveryCreditV1Schema = z
    .object({
    providerCreditId: z.string().trim().min(1).optional(),
    kind: ConnectedServiceQuotaRecoveryCreditKindV1Schema,
    status: ConnectedServiceQuotaRecoveryCreditStatusV1Schema,
    providerResetType: z.string().trim().min(1).optional(),
    appliesToProviderLimitId: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().min(1).nullable().optional(),
    grantedAtMs: z.number().int().nonnegative().nullable().optional(),
    expiresAtMs: z.number().int().nonnegative().nullable().optional(),
    redeemStartedAtMs: z.number().int().nonnegative().nullable().optional(),
    redeemedAtMs: z.number().int().nonnegative().nullable().optional(),
})
    .strict();
export const ConnectedServiceQuotaRecoveryCreditsV1Schema = z
    .object({
    kind: z.literal('usage_limit_resets'),
    availableCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative().optional(),
    nextExpiresAtMs: z.number().int().nonnegative().nullable().optional(),
    source: ConnectedServiceQuotaSourceV1Schema.optional(),
    confidence: ConnectedServiceQuotaConfidenceV1Schema.optional(),
    credits: z.array(ConnectedServiceQuotaRecoveryCreditV1Schema).default([]),
})
    .strict()
    .superRefine((value, ctx) => {
    if (typeof value.totalCount === 'number' && value.totalCount < value.availableCount) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'totalCount must be greater than or equal to availableCount',
            path: ['totalCount'],
        });
    }
});
export const ConnectedServiceQuotaMeterScopeV1Schema = z.enum([
    'primary',
    'secondary',
    'daily',
    'weekly',
    'monthly',
    'five_hour',
    'seven_day',
    'session',
    'rolling',
    'model',
    'requests',
    'tokens',
    'unknown',
]);
export const ConnectedServiceQuotaLimitScopeV1Schema = z.enum([
    'account',
    'workspace',
    'organization',
    'model',
    'provider',
    'session',
    'unknown',
]);
const ConnectedServiceQuotaEvidenceV1Schema = z
    .object({
    kind: z.string().trim().min(1).optional(),
    status: z.number().int().min(100).max(599).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    code: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
    providerLimitId: z.string().trim().min(1).optional(),
    observedAtMs: z.number().int().nonnegative().optional(),
})
    .strict()
    .superRefine((evidence, ctx) => {
    if (!evidence.headers)
        return;
    for (const headerName of Object.keys(evidence.headers)) {
        const normalized = headerName.trim().toLowerCase();
        if (normalized === 'authorization'
            || normalized === 'proxy-authorization'
            || normalized === 'cookie'
            || normalized === 'set-cookie'
            || normalized.includes('authorization')
            || normalized.includes('token')
            || normalized.includes('secret')
            || normalized.includes('api-key')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Unsafe quota evidence header',
                path: ['headers', headerName],
            });
        }
    }
});
export const ConnectedServiceQuotaResetSourceV1Schema = z.enum([
    'header',
    'body',
    'provider_event',
    'provider_probe',
    'in_band_snapshot',
    'computed',
    'provider',
    'retry_after',
    'manual',
    'unknown',
]);
export const ConnectedServiceQuotaMeterV1Schema = z
    .object({
    meterId: z.string().min(1),
    label: z.string().min(1),
    used: z.number().finite().nullable(),
    limit: z.number().finite().nullable(),
    remaining: z.number().finite().nullable().optional(),
    remainingPct: z.number().finite().min(0).max(100).nullable().optional(),
    usedPct: z.number().finite().min(0).max(100).nullable().optional(),
    resetAtMs: z.number().int().nonnegative().nullable().optional(),
    resetSource: ConnectedServiceQuotaResetSourceV1Schema.optional(),
    providerLimitId: z.string().trim().min(1).optional(),
    modelId: z.string().trim().min(1).nullable().optional(),
    isExhausted: z.boolean().optional(),
    isSoftLimited: z.boolean().optional(),
    isCapacityLimited: z.boolean().optional(),
    unit: ConnectedServiceQuotaUnitV1Schema,
    utilizationPct: z.number().finite().min(0).max(100).nullable(),
    resetsAt: z.number().int().nonnegative().nullable(),
    status: z.enum(['ok', 'unavailable', 'estimated']),
    source: ConnectedServiceQuotaSourceV1Schema.optional(),
    scope: ConnectedServiceQuotaMeterScopeV1Schema.optional(),
    limitScope: ConnectedServiceQuotaLimitScopeV1Schema.optional(),
    confidence: ConnectedServiceQuotaConfidenceV1Schema.optional(),
    details: z
        .object({
        note: z.string().min(1).nullable().optional(),
        code: z.string().trim().min(1).optional(),
        rawScope: z.string().trim().min(1).optional(),
        remainingPct: z.number().finite().min(0).max(100).nullable().optional(),
        scope: ConnectedServiceQuotaMeterScopeV1Schema.optional(),
        providerLimitId: z.string().trim().min(1).optional(),
        limitCategory: ConnectedServiceLimitCategoryV1Schema.optional(),
    })
        .optional()
        .default({}),
});
export const ConnectedServiceUsageSourceBindingKindV1Schema = z.enum(['profile', 'group_member']);
export const ConnectedServiceUsageSourceV1Schema = z.discriminatedUnion('bindingKind', [
    z.object({
        serviceId: ConnectedServiceIdSchema,
        profileId: ConnectedServiceProfileIdSchema,
        bindingKind: z.literal('profile'),
    }).strict(),
    z.object({
        serviceId: ConnectedServiceIdSchema,
        profileId: ConnectedServiceProfileIdSchema,
        bindingKind: z.literal('group_member'),
        groupId: z.string().trim().min(1),
        groupGeneration: z.number().int().nonnegative().optional(),
    }).strict(),
]);
export const ConnectedServiceQuotaSnapshotV1Schema = z
    .object({
    v: z.literal(1),
    serviceId: ConnectedServiceIdSchema,
    profileId: ConnectedServiceProfileIdSchema,
    fetchedAt: z.number().int().nonnegative(),
    staleAfterMs: z.number().int().min(1),
    planLabel: z.string().min(1).nullable(),
    accountLabel: z.string().min(1).nullable(),
    providerId: z.string().trim().min(1).optional(),
    activeAccountId: z.string().trim().min(1).optional(),
    fetchedAtMs: z.number().int().nonnegative().optional(),
    staleAtMs: z.number().int().nonnegative().optional(),
    source: ConnectedServiceQuotaSourceV1Schema.optional(),
    confidence: ConnectedServiceQuotaConfidenceV1Schema.optional(),
    evidence: ConnectedServiceQuotaEvidenceV1Schema.optional(),
    meters: z.array(ConnectedServiceQuotaMeterV1Schema),
    recoveryCredits: ConnectedServiceQuotaRecoveryCreditsV1Schema.optional(),
});
export const SealedConnectedServiceQuotaSnapshotV1Schema = z.object({
    format: ConnectedServiceCredentialFormatSchema,
    ciphertext: z.string().min(1),
});
export const ConnectedServiceAuthGroupPolicyV1Schema = z
    .object({
    v: z.literal(1).default(1),
    strategy: z.enum(['priority', 'least_limited', 'manual']).default('least_limited'),
    autoSwitch: z.boolean().default(false),
    switchOn: z
        .object({
        usageLimit: z.boolean(),
        authExpired: z.boolean(),
        accountChanged: z.boolean(),
        refreshFailure: z.boolean(),
    })
        .strict()
        .default({
        usageLimit: true,
        authExpired: true,
        accountChanged: true,
        refreshFailure: false,
    }),
    cooldownMs: z.number().int().min(0).default(30_000),
    honorProviderResetsAt: z.boolean().default(true),
    autoRestorePrimaryWhenReset: z.boolean().default(false),
    maxSwitchesPerTurn: z.number().int().min(0).default(1),
    maxSwitchesPerSessionHour: z.number().int().min(0).default(3),
    softSwitchRemainingPercent: z.number().finite().min(0).max(100).default(15),
    probeIfSnapshotOlderThanMs: z.number().int().min(1).default(300_000),
    preTurnProbeMode: z.enum(['never', 'when_stale', 'always_for_group']).default('when_stale'),
    preTurnProbeOrder: z
        .enum(['current_first_then_candidates', 'candidates_first_then_current'])
        .default('current_first_then_candidates'),
    recoveryMode: z
        .enum(['off', 'wait_until_reset', 'switch_then_resume', 'switch_or_wait'])
        .default('switch_or_wait'),
    resumePromptMode: z.enum(['standard', 'off', 'custom']).default('standard'),
})
    .strict();
export const ConnectedServiceAuthGroupPolicyPatchV1Schema = z
    .object({
    v: z.literal(1).optional(),
    strategy: z.enum(['priority', 'least_limited', 'manual']).optional(),
    autoSwitch: z.boolean().optional(),
    switchOn: z
        .object({
        usageLimit: z.boolean().optional(),
        authExpired: z.boolean().optional(),
        accountChanged: z.boolean().optional(),
        refreshFailure: z.boolean().optional(),
    })
        .strict()
        .optional(),
    cooldownMs: z.number().int().min(0).optional(),
    honorProviderResetsAt: z.boolean().optional(),
    autoRestorePrimaryWhenReset: z.boolean().optional(),
    maxSwitchesPerTurn: z.number().int().min(0).optional(),
    maxSwitchesPerSessionHour: z.number().int().min(0).optional(),
    softSwitchRemainingPercent: z.number().finite().min(0).max(100).optional(),
    probeIfSnapshotOlderThanMs: z.number().int().min(1).optional(),
    preTurnProbeMode: z.enum(['never', 'when_stale', 'always_for_group']).optional(),
    preTurnProbeOrder: z.enum(['current_first_then_candidates', 'candidates_first_then_current']).optional(),
    recoveryMode: z.enum(['off', 'wait_until_reset', 'switch_then_resume', 'switch_or_wait']).optional(),
    resumePromptMode: z.enum(['standard', 'off', 'custom']).optional(),
})
    .strict();
export const ConnectedServiceAuthGroupMemberStateV1Schema = z
    .object({
    cooldownUntilMs: z.number().int().nonnegative().nullable().optional(),
    exhaustedUntilMs: z.number().int().nonnegative().nullable().optional(),
    quotaExhaustedUntilMs: z.number().int().nonnegative().nullable().optional(),
    rateLimitedUntilMs: z.number().int().nonnegative().nullable().optional(),
    capacityLimitedUntilMs: z.number().int().nonnegative().nullable().optional(),
    authInvalidUntilMs: z.number().int().nonnegative().nullable().optional(),
    planUnavailableUntilMs: z.number().int().nonnegative().nullable().optional(),
    validationBlockedUntilMs: z.number().int().nonnegative().nullable().optional(),
    lastFailureKind: z.string().trim().min(1).nullable().optional(),
    lastFailureCode: z.string().trim().min(1).nullable().optional(),
    lastObservedPlanType: z.string().trim().min(1).nullable().optional(),
    lastObservedAtMs: z.number().int().nonnegative().nullable().optional(),
    providerResetsAtMs: z.number().int().nonnegative().nullable().optional(),
    credentialHealthStatus: ConnectedServiceCredentialHealthStatusV1Schema.nullable().optional(),
})
    .passthrough()
    .default({});
export const ConnectedServiceAuthGroupStateV1Schema = z
    .object({
    status: z.enum(['ready', 'switching', 'exhausted', 'error', 'unknown']).optional(),
    lastSwitchAt: z.number().int().nonnegative().nullable().optional(),
    lastSwitchReason: z.string().trim().min(1).nullable().optional(),
})
    .passthrough()
    .default({});
const ConnectedServiceAuthGroupStatePatchV1Schema = z
    .object({
    status: z.enum(['ready', 'switching', 'exhausted', 'error', 'unknown']).optional(),
    lastSwitchAt: z.number().int().nonnegative().nullable().optional(),
    lastSwitchReason: z.string().trim().min(1).nullable().optional(),
})
    .passthrough();
export const ConnectedServiceAuthGroupMemberV1Schema = z
    .object({
    v: z.literal(1),
    serviceId: ConnectedServiceIdSchema,
    groupId: ConnectedServiceAuthGroupIdSchema,
    profileId: ConnectedServiceProfileIdSchema,
    priority: z.number().int().default(100),
    enabled: z.boolean().default(true),
    state: ConnectedServiceAuthGroupMemberStateV1Schema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
})
    .strict();
export const ConnectedServiceAuthGroupV1Schema = z
    .object({
    v: z.literal(1),
    serviceId: ConnectedServiceIdSchema,
    groupId: ConnectedServiceAuthGroupIdSchema,
    displayName: z.string().trim().min(1).nullable(),
    policy: ConnectedServiceAuthGroupPolicyV1Schema,
    activeProfileId: ConnectedServiceProfileIdSchema.nullable(),
    generation: z.number().int().nonnegative(),
    runtimeStateRevision: z.number().int().nonnegative(),
    state: ConnectedServiceAuthGroupStateV1Schema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    members: z.array(ConnectedServiceAuthGroupMemberV1Schema).default([]),
})
    .strict();
export const ConnectedServiceAuthGroupRouteParamsV1Schema = z
    .object({
    serviceId: ConnectedServiceIdSchema,
    groupId: ConnectedServiceAuthGroupIdSchema,
})
    .strict();
const ConnectedServiceAuthGroupMemberInputV1Schema = z
    .object({
    profileId: ConnectedServiceProfileIdSchema,
    priority: z.number().int().default(100),
    enabled: z.boolean().default(true),
})
    .strict();
const ConnectedServiceAuthGroupExpectedGenerationV1Schema = z.number().int().nonnegative();
const ConnectedServiceAuthGroupExpectedGenerationQueryV1Schema = z.preprocess((value) => {
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? Number(trimmed) : value;
}, ConnectedServiceAuthGroupExpectedGenerationV1Schema);
export const ConnectedServiceAuthGroupCreateRequestV1Schema = z
    .object({
    groupId: ConnectedServiceAuthGroupIdSchema,
    displayName: z.string().trim().min(1).nullable().optional(),
    policy: ConnectedServiceAuthGroupPolicyPatchV1Schema.optional(),
    members: z.array(ConnectedServiceAuthGroupMemberInputV1Schema).default([]),
    activeProfileId: ConnectedServiceProfileIdSchema.nullable().optional(),
})
    .strict();
export const ConnectedServiceAuthGroupPatchRequestV1Schema = z
    .object({
    displayName: z.string().trim().min(1).nullable().optional(),
    policy: ConnectedServiceAuthGroupPolicyPatchV1Schema.optional(),
    activeProfileId: ConnectedServiceProfileIdSchema.nullable().optional(),
    expectedGeneration: z.number().int().nonnegative().optional(),
    overrideRuntimeCooldown: z.boolean().optional(),
})
    .strict()
    .superRefine((request, ctx) => {
    if ((request.activeProfileId !== undefined || request.policy !== undefined)
        && request.expectedGeneration === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['expectedGeneration'],
            message: 'expectedGeneration is required when generation-sensitive group fields are patched',
        });
    }
});
export const ConnectedServiceAuthGroupMemberCreateRequestV1Schema = ConnectedServiceAuthGroupMemberInputV1Schema
    .extend({
    expectedGeneration: ConnectedServiceAuthGroupExpectedGenerationV1Schema,
})
    .strict();
export const ConnectedServiceAuthGroupMemberPatchRequestV1Schema = z
    .object({
    priority: z.number().int().optional(),
    enabled: z.boolean().optional(),
    expectedGeneration: ConnectedServiceAuthGroupExpectedGenerationV1Schema,
})
    .strict();
export const ConnectedServiceAuthGroupMemberDeleteRequestV1Schema = z
    .object({
    expectedGeneration: ConnectedServiceAuthGroupExpectedGenerationQueryV1Schema,
})
    .strict();
export const ConnectedServiceAuthGroupActiveProfileRequestV1Schema = z
    .object({
    profileId: ConnectedServiceProfileIdSchema,
    expectedGeneration: z.number().int().nonnegative(),
    overrideRuntimeCooldown: z.boolean().optional(),
})
    .strict();
const ConnectedServiceAuthGroupMemberRuntimeStatePatchV1Schema = z
    .object({
    profileId: ConnectedServiceProfileIdSchema,
    state: ConnectedServiceAuthGroupMemberStateV1Schema,
})
    .strict();
export const ConnectedServiceAuthGroupRuntimeStatePatchRequestV1Schema = z
    .object({
    expectedGeneration: z.number().int().nonnegative().optional(),
    expectedRuntimeStateRevision: z.number().int().nonnegative().optional(),
    state: ConnectedServiceAuthGroupStatePatchV1Schema.optional(),
    memberStates: z.array(ConnectedServiceAuthGroupMemberRuntimeStatePatchV1Schema).default([]),
})
    .strict();
export const ConnectedServiceAuthGroupListResponseV1Schema = z
    .object({
    groups: z.array(ConnectedServiceAuthGroupV1Schema),
})
    .strict();
export const ConnectedServiceAuthGroupResponseV1Schema = z
    .object({
    group: ConnectedServiceAuthGroupV1Schema,
})
    .strict();
export const ConnectedServiceAuthGroupErrorCodeV1Schema = z.enum([
    'connect_group_not_found',
    'connect_group_invalid',
    'connect_group_already_exists',
    'connect_group_member_profile_not_found',
    'connect_group_member_already_exists',
    'connect_group_member_not_found',
    'connect_group_duplicate_member',
    'connect_group_active_profile_not_member',
    'connect_group_profile_runtime_cooldown',
    'connect_group_generation_conflict',
    'connect_group_generation_required',
    'connect_group_runtime_state_revision_conflict',
    'connect_group_runtime_state_revision_required',
    'connect_group_fallback_disabled',
    'connect_group_runtime_fallback_unsupported',
    'connect_credential_referenced_by_group',
]);
export const ConnectedServiceAuthGroupErrorResponseV1Schema = z.object({
    error: ConnectedServiceAuthGroupErrorCodeV1Schema,
    generation: z.number().int().min(0).optional(),
    runtimeStateRevision: z.number().int().min(0).optional(),
    resetAtMs: z.number().int().nonnegative().optional(),
}).strict();
//# sourceMappingURL=connectedServiceSchemas.js.map