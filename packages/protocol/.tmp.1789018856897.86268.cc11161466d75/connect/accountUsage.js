import { sha256 } from '@noble/hashes/sha2';
import { z } from 'zod';
import { openAccountScopedBlobCiphertext, sealAccountScopedBlobCiphertext, } from '../crypto/accountScopedCipher.js';
import { encodeBase64 } from '../crypto/base64.js';
import { ConnectedServiceCredentialFormatSchema, ConnectedServiceQuotaConfidenceV1Schema, ConnectedServiceQuotaMeterV1Schema, ConnectedServiceQuotaRecoveryCreditsV1Schema, ConnectedServiceQuotaSourceV1Schema, ConnectedServiceUsageSourceV1Schema, } from './connectedServiceSchemas.js';
const encoder = new TextEncoder();
export const ProviderAccountUsageRecordIdSchema = z.string().regex(/^paug_v1_[A-Za-z0-9_-]{8,}$/);
const PROVIDER_ACCOUNT_USAGE_OPAQUE_REF_PART_MAX_LENGTH = 102;
const ProviderAccountUsageOpaqueRefPartSchema = z.string()
    .trim()
    .min(1)
    .max(PROVIDER_ACCOUNT_USAGE_OPAQUE_REF_PART_MAX_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/);
function isPathLikeLocalCredentialRef(value) {
    return value.startsWith('/')
        || value.startsWith('~/')
        || value.startsWith('~\\')
        || value.startsWith('file:')
        || /^[A-Za-z]:[\\/]/u.test(value)
        || value.includes('\\')
        || value.includes('/');
}
export function buildProviderAccountUsageOpaqueLocalCredentialRef(params) {
    const providerId = ProviderAccountUsageOpaqueRefPartSchema.parse(params.providerId);
    const kind = ProviderAccountUsageOpaqueRefPartSchema.parse(params.kind);
    const value = z.string().trim().min(1).max(4096).parse(params.value);
    const digest = sha256(encoder.encode(JSON.stringify({ providerId, kind, value })));
    return `opaque:${providerId}:${kind}:${encodeBase64(digest, 'base64url')}`;
}
export const ProviderAccountUsageSubjectKindV1Schema = z.enum([
    'account',
    'workspace',
    'organization',
    'tenant',
    'subscription',
    'project',
    'modelFamily',
    'unknown',
]);
export const ProviderAccountUsageQuotaScopeV1Schema = z.enum([
    'account',
    'workspace',
    'organization',
    'project',
    'model',
    'provider',
    'unknown',
]);
export const ProviderAccountUsageRecordKeyV1Schema = z.object({
    providerId: z.string().trim().min(1).max(128),
    accountSubjectId: z.string().trim().min(1).max(512),
    subjectKind: ProviderAccountUsageSubjectKindV1Schema,
    quotaScope: ProviderAccountUsageQuotaScopeV1Schema,
    quotaScopeId: z.string().trim().min(1).max(256).optional(),
}).strict();
export const ProviderAccountSubjectRefV1Schema = z.object({
    kind: z.enum(['providerSubject', 'provisionalLocalSubject']),
    id: z.string().trim().min(1).max(512),
    mergeKey: z.string().trim().min(1).max(512).optional(),
}).strict();
export const ProviderAccountUsageSourceV1Schema = z.enum([
    'runtimeSignal',
    'providerHttp',
    'proxy',
    'connectedServiceProbe',
    'cached',
    'manual',
    'unknown',
]);
export const ProviderAccountUsageConfidenceV1Schema = z.enum(['confirmed', 'estimated', 'unknown']);
export const ProviderAccountUsageStateV1Schema = z.enum([
    'not_loaded',
    'loaded_empty',
    'loaded_data',
    'stale_data',
    'error_last_known_good',
]);
const SECRET_FIELD_VALUE_PATTERN = /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|jwt|password|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{12,}/i;
const AUTHORIZATION_BEARER_VALUE_PATTERN = /\bauthorization\s*:\s*bearer\s+\S+/i;
const X_API_KEY_HEADER_VALUE_PATTERN = /\bx-api-key\s*:\s*\S{12,}/i;
const JWT_VALUE_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/;
const AWS_ACCESS_KEY_VALUE_PATTERN = /\b(?:A3T[A-Z0-9]{16}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})\b/;
const GITHUB_TOKEN_VALUE_PATTERN = /\bgh[pousr]_[A-Za-z0-9]{20,}\b/;
const OPENAI_SECRET_KEY_VALUE_PATTERN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{10,}\b/i;
function containsUnsafeProviderAccountUsageDiagnosticText(value) {
    if (!value)
        return false;
    return SECRET_FIELD_VALUE_PATTERN.test(value)
        || AUTHORIZATION_BEARER_VALUE_PATTERN.test(value)
        || X_API_KEY_HEADER_VALUE_PATTERN.test(value)
        || JWT_VALUE_PATTERN.test(value)
        || AWS_ACCESS_KEY_VALUE_PATTERN.test(value)
        || GITHUB_TOKEN_VALUE_PATTERN.test(value)
        || OPENAI_SECRET_KEY_VALUE_PATTERN.test(value);
}
export const ProviderAccountUsageDiagnosticV1Schema = z.object({
    kind: z.enum(['unavailable', 'provider_http', 'runtime_signal', 'projection', 'validation', 'storage', 'unknown']),
    code: z.string().trim().min(1).max(128).optional(),
    message: z.string().trim().min(1).max(512).optional(),
    status: z.number().int().min(100).max(599).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    observedAtMs: z.number().int().nonnegative().optional(),
}).strict().superRefine((diagnostic, ctx) => {
    if (diagnostic.headers) {
        for (const [headerName, headerValue] of Object.entries(diagnostic.headers)) {
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
                    message: 'Unsafe provider account usage diagnostic header',
                    path: ['headers', headerName],
                });
            }
            if (containsUnsafeProviderAccountUsageDiagnosticText(headerValue)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Unsafe provider account usage diagnostic header value',
                    path: ['headers', headerName],
                });
            }
        }
    }
    if (containsUnsafeProviderAccountUsageDiagnosticText(diagnostic.code)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Unsafe provider account usage diagnostic code',
            path: ['code'],
        });
    }
    if (containsUnsafeProviderAccountUsageDiagnosticText(diagnostic.message)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Unsafe provider account usage diagnostic message',
            path: ['message'],
        });
    }
});
export const ProviderAccountUsageSnapshotV1Schema = z.object({
    v: z.literal(1),
    recordId: ProviderAccountUsageRecordIdSchema,
    recordKey: ProviderAccountUsageRecordKeyV1Schema,
    providerId: z.string().trim().min(1).max(128),
    accountSubject: ProviderAccountSubjectRefV1Schema,
    observedAtMs: z.number().int().nonnegative(),
    fetchedAtMs: z.number().int().nonnegative(),
    staleAfterMs: z.number().int().min(1),
    source: ProviderAccountUsageSourceV1Schema,
    confidence: ProviderAccountUsageConfidenceV1Schema,
    state: ProviderAccountUsageStateV1Schema.default('loaded_data'),
    planLabel: z.string().trim().min(1).max(256).nullable().optional(),
    accountLabel: z.string().trim().min(1).max(256).nullable().optional(),
    recoveryCredits: ConnectedServiceQuotaRecoveryCreditsV1Schema.optional(),
    meters: z.array(ConnectedServiceQuotaMeterV1Schema),
    diagnostics: z.array(ProviderAccountUsageDiagnosticV1Schema).optional(),
}).strict().superRefine((snapshot, ctx) => {
    if (snapshot.recordId !== buildProviderAccountUsageRecordId(snapshot.recordKey)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Snapshot recordId must match recordKey',
            path: ['recordId'],
        });
    }
    if (snapshot.providerId !== snapshot.recordKey.providerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Snapshot providerId must match recordKey providerId',
            path: ['providerId'],
        });
    }
    if (snapshot.accountSubject.id !== snapshot.recordKey.accountSubjectId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Account subject id must match recordKey accountSubjectId',
            path: ['accountSubject', 'id'],
        });
    }
});
export const SealedProviderAccountUsageSnapshotV1Schema = z.object({
    format: ConnectedServiceCredentialFormatSchema,
    ciphertext: z.string().min(1),
});
function canonicalRecordKeyJson(key) {
    return JSON.stringify({
        providerId: key.providerId,
        accountSubjectId: key.accountSubjectId,
        subjectKind: key.subjectKind,
        quotaScope: key.quotaScope,
        ...(key.quotaScopeId ? { quotaScopeId: key.quotaScopeId } : {}),
    });
}
export function buildProviderAccountUsageRecordId(key) {
    const parsed = ProviderAccountUsageRecordKeyV1Schema.parse(key);
    const digest = sha256(encoder.encode(canonicalRecordKeyJson(parsed)));
    return ProviderAccountUsageRecordIdSchema.parse(`paug_v1_${encodeBase64(digest, 'base64url')}`);
}
function mapUsageSourceToQuotaSource(source) {
    const mapped = {
        runtimeSignal: 'in_band_provider_snapshot',
        providerHttp: 'provider_api',
        proxy: 'background_fetch',
        connectedServiceProbe: 'user_probe',
        cached: 'cached',
        manual: 'manual_refresh',
        unknown: 'unknown',
    };
    return ConnectedServiceQuotaSourceV1Schema.parse(mapped[source]);
}
function mapUsageConfidenceToQuotaConfidence(confidence) {
    const mapped = {
        confirmed: 'exact',
        estimated: 'estimated',
        unknown: 'unknown',
    };
    return ConnectedServiceQuotaConfidenceV1Schema.parse(mapped[confidence]);
}
export function projectProviderAccountUsageToConnectedServiceQuotaSnapshot(snapshot, source) {
    const parsed = ProviderAccountUsageSnapshotV1Schema.parse(snapshot);
    const parsedSource = ConnectedServiceUsageSourceV1Schema.parse(source);
    const serviceId = parsedSource.serviceId;
    const profileId = parsedSource.profileId;
    return {
        v: 1,
        serviceId,
        profileId,
        fetchedAt: parsed.fetchedAtMs,
        staleAfterMs: parsed.staleAfterMs,
        planLabel: parsed.planLabel ?? null,
        accountLabel: parsed.accountLabel ?? null,
        providerId: parsed.providerId,
        activeAccountId: parsed.recordKey.accountSubjectId,
        fetchedAtMs: parsed.fetchedAtMs,
        staleAtMs: parsed.fetchedAtMs + parsed.staleAfterMs,
        source: mapUsageSourceToQuotaSource(parsed.source),
        confidence: mapUsageConfidenceToQuotaConfidence(parsed.confidence),
        ...(parsed.recoveryCredits ? { recoveryCredits: parsed.recoveryCredits } : {}),
        meters: parsed.meters,
    };
}
export function projectProviderAccountUsageSnapshotToConnectedServiceQuotaSnapshotV1(params) {
    return projectProviderAccountUsageToConnectedServiceQuotaSnapshot(params.snapshot, params.source);
}
export function sealProviderAccountUsageSnapshotCiphertext(params) {
    return sealAccountScopedBlobCiphertext({
        kind: 'provider_account_usage_snapshot',
        material: params.material,
        payload: params.payload,
        randomBytes: params.randomBytes,
    });
}
export function openProviderAccountUsageSnapshotCiphertext(params) {
    return openAccountScopedBlobCiphertext({
        kind: 'provider_account_usage_snapshot',
        material: params.material,
        ciphertext: params.ciphertext,
    });
}
//# sourceMappingURL=accountUsage.js.map