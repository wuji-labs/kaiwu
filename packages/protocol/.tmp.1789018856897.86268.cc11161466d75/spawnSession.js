import { z } from 'zod';
import { CONNECTED_SERVICE_UX_DIAGNOSTIC_ACTIONS, CONNECTED_SERVICE_UX_DIAGNOSTIC_CODES, isConnectedServiceUxDiagnosticV1, normalizeConnectedServiceUxDiagnosticV1, } from './connect/connectedServiceUxDiagnostics.js';
/** Fresh execution authority is bound to an exact user request and, when present, its durable revision. */
export const SpawnSessionExecutionAuthorizationSchema = z.object({
    provenance: z.literal('user_request'),
    requestId: z.string().refine((value) => value.trim().length > 0, {
        message: 'Execution authorization request id must not be blank',
    }),
    requestedAt: z.number().int().nonnegative().optional(),
}).strict();
/**
 * One-shot first user input carried by a fresh-session spawn until the runner can commit it to
 * Pending. The opaque local id is the cross-boundary de-duplication identity.
 */
export const PendingFirstInputV1Schema = z.object({
    text: z.string().refine((value) => value.trim().length > 0, {
        message: 'Pending first input text must not be blank',
    }),
    localId: z.string().refine((value) => value.trim().length > 0, {
        message: 'Pending first input local id must not be blank',
    }),
    meta: z.record(z.string(), z.unknown()).optional(),
}).strict();
export const SPAWN_SESSION_ERROR_CODES = {
    INVALID_REQUEST: 'INVALID_REQUEST',
    INVALID_ENVIRONMENT_VARIABLES: 'INVALID_ENVIRONMENT_VARIABLES',
    AUTH_ENV_UNEXPANDED: 'AUTH_ENV_UNEXPANDED',
    RESUME_NOT_SUPPORTED: 'RESUME_NOT_SUPPORTED',
    RESUME_MISSING_ENCRYPTION_KEY: 'RESUME_MISSING_ENCRYPTION_KEY',
    RESUME_UNSUPPORTED_ENCRYPTION_VARIANT: 'RESUME_UNSUPPORTED_ENCRYPTION_VARIANT',
    DIRECTORY_CREATE_FAILED: 'DIRECTORY_CREATE_FAILED',
    SPAWN_VALIDATION_FAILED: 'SPAWN_VALIDATION_FAILED',
    SPAWN_NO_PID: 'SPAWN_NO_PID',
    CHILD_EXITED_BEFORE_WEBHOOK: 'CHILD_EXITED_BEFORE_WEBHOOK',
    SESSION_WEBHOOK_TIMEOUT: 'SESSION_WEBHOOK_TIMEOUT',
    ACCOUNT_SCOPE_CHANGED: 'ACCOUNT_SCOPE_CHANGED',
    SPAWN_FAILED: 'SPAWN_FAILED',
    DAEMON_RPC_UNAVAILABLE: 'DAEMON_RPC_UNAVAILABLE',
    DAEMON_UPGRADE_REQUIRED: 'DAEMON_UPGRADE_REQUIRED',
    UNEXPECTED: 'UNEXPECTED',
};
/**
 * Structured, machine-recognizable detail attached to a spawn error so clients can react
 * programmatically instead of parsing the human-readable `errorMessage`.
 *
 * This is a discriminated union keyed by `kind`; it is ADDITIVE and OPTIONAL on the spawn error
 * result. Existing consumers that only read `errorCode`/`errorMessage` keep working unchanged.
 */
export const SPAWN_SESSION_ERROR_DETAIL_KINDS = {
    /**
     * A connected-service auth switch/resume fail-closed because the resumed session could not be
     * proven reachable in the materialized target before the vendor launched (K1 §2 gate). Surfaced
     * under `SPAWN_VALIDATION_FAILED` (the enum value is unchanged for back-compat); this detail
     * carries the structured continuity reason so the client can show the "switch unavailable"
     * explanation and offer "start fresh under the new account".
     */
    CONNECTED_SERVICE_RESUME_UNREACHABLE: 'connected_service_resume_unreachable',
    /**
     * A connected-service spawn failure whose useful, protocol-owned UI detail is the diagnostic
     * itself. This covers fail-closed errors that are not resume-reachability probes, such as missing
     * materialization identity during existing-session attach.
     */
    CONNECTED_SERVICE_UX_DIAGNOSTIC: 'connected_service_ux_diagnostic',
};
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function readNonEmptyString(record, key) {
    const value = record[key];
    return isNonEmptyString(value) ? value.trim() : null;
}
function isDiagnosticScalar(value) {
    return value === null
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean';
}
const DAEMON_LOCAL_SPAWN_DETAIL_KEYS = new Set([
    'candidatePersistedSessionFile',
    'cwd',
    'persistedSessionFile',
    'providerResumeId',
    'resolvedPath',
    'sessionFile',
    'targetMaterializedRoot',
    'vendorResumeId',
]);
function hasDaemonLocalSpawnDetailKey(detail) {
    for (const key of DAEMON_LOCAL_SPAWN_DETAIL_KEYS) {
        if (hasOwn(detail, key))
            return true;
    }
    return false;
}
const DAEMON_LOCAL_DIAGNOSTIC_KEY_PATTERN = /(?:^cwd$|path|file|root|dir|directory|home|materialized|persisted|vendor[_-]?resume[_-]?id|provider[_-]?resume[_-]?id|resume[_-]?id)/i;
function looksLikeLocalFilesystemPath(value) {
    const trimmed = value.trim();
    return trimmed.startsWith('/')
        || trimmed.startsWith('~/')
        || trimmed.startsWith('~\\')
        || /^[A-Za-z]:[\\/]/.test(trimmed)
        || trimmed.startsWith('\\\\');
}
function sanitizeUxDiagnosticDiagnostics(diagnostics, fallbackReason) {
    const sanitized = {};
    if (diagnostics) {
        for (const [key, value] of Object.entries(diagnostics)) {
            if (!isDiagnosticScalar(value))
                continue;
            if (DAEMON_LOCAL_SPAWN_DETAIL_KEYS.has(key) || DAEMON_LOCAL_DIAGNOSTIC_KEY_PATTERN.test(key))
                continue;
            if (typeof value === 'string' && looksLikeLocalFilesystemPath(value))
                continue;
            sanitized[key] = value;
        }
    }
    if (fallbackReason && !('reason' in sanitized)) {
        sanitized.reason = fallbackReason;
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
function hasUnsafeUxDiagnosticDiagnostics(diagnostics) {
    if (!diagnostics)
        return false;
    for (const [key, value] of Object.entries(diagnostics)) {
        if (DAEMON_LOCAL_SPAWN_DETAIL_KEYS.has(key) || DAEMON_LOCAL_DIAGNOSTIC_KEY_PATTERN.test(key)) {
            return true;
        }
        if (typeof value === 'string' && looksLikeLocalFilesystemPath(value)) {
            return true;
        }
    }
    return false;
}
function isPublicSafeUxDiagnostic(value) {
    return isConnectedServiceUxDiagnosticV1(value)
        && !hasUnsafeUxDiagnosticDiagnostics(value.diagnostics);
}
function createLegacyResumeUnreachableUxDiagnostic(params) {
    return {
        code: CONNECTED_SERVICE_UX_DIAGNOSTIC_CODES.providerSessionStateUnavailableForResume,
        failurePhase: 'continuity',
        source: 'spawn_resume',
        agentId: params.agentId,
        retryable: false,
        suggestedActions: [
            CONNECTED_SERVICE_UX_DIAGNOSTIC_ACTIONS.startFreshUnderSelectedAccount,
            CONNECTED_SERVICE_UX_DIAGNOSTIC_ACTIONS.resumeCurrentAccount,
        ],
        diagnostics: {
            reason: params.reason,
        },
    };
}
function sanitizeUxDiagnostic(value, fallbackReason) {
    const parsed = normalizeConnectedServiceUxDiagnosticV1(value);
    if (!parsed)
        return null;
    const diagnostics = sanitizeUxDiagnosticDiagnostics(parsed.diagnostics, fallbackReason);
    const candidate = {
        ...parsed,
        ...(diagnostics ? { diagnostics } : {}),
    };
    if (!diagnostics && 'diagnostics' in candidate) {
        delete candidate.diagnostics;
    }
    return isConnectedServiceUxDiagnosticV1(candidate) ? candidate : null;
}
function normalizeConnectedServiceResumeUnreachableDetail(detail) {
    if (detail.kind !== SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_RESUME_UNREACHABLE) {
        return undefined;
    }
    if (detail.continuityErrorCode !== 'provider_session_state_unavailable_for_resume') {
        return undefined;
    }
    if (detail.failurePhase !== 'continuity') {
        return undefined;
    }
    const agentId = readNonEmptyString(detail, 'agentId');
    const reason = readNonEmptyString(detail, 'reason');
    if (!agentId || !reason) {
        return undefined;
    }
    const uxDiagnostic = sanitizeUxDiagnostic(hasOwn(detail, 'uxDiagnostic')
        ? detail.uxDiagnostic
        : createLegacyResumeUnreachableUxDiagnostic({ agentId, reason }), reason);
    if (!uxDiagnostic) {
        return undefined;
    }
    return {
        kind: SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_RESUME_UNREACHABLE,
        continuityErrorCode: 'provider_session_state_unavailable_for_resume',
        failurePhase: 'continuity',
        agentId,
        reason,
        uxDiagnostic,
    };
}
function normalizeConnectedServiceUxDiagnosticDetail(detail) {
    if (detail.kind !== SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_UX_DIAGNOSTIC) {
        return undefined;
    }
    const uxDiagnostic = sanitizeUxDiagnostic(detail.uxDiagnostic, null);
    if (!uxDiagnostic) {
        return undefined;
    }
    return {
        kind: SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_UX_DIAGNOSTIC,
        uxDiagnostic,
    };
}
export function isConnectedServiceResumeUnreachableSpawnErrorDetail(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const detail = value;
    return detail.kind === SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_RESUME_UNREACHABLE
        && detail.continuityErrorCode === 'provider_session_state_unavailable_for_resume'
        && detail.failurePhase === 'continuity'
        && isNonEmptyString(detail.agentId)
        && isNonEmptyString(detail.reason)
        && !hasDaemonLocalSpawnDetailKey(detail)
        && isPublicSafeUxDiagnostic(detail.uxDiagnostic);
}
export function isConnectedServiceUxDiagnosticSpawnErrorDetail(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const detail = value;
    return detail.kind === SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_UX_DIAGNOSTIC
        && !hasDaemonLocalSpawnDetailKey(detail)
        && isPublicSafeUxDiagnostic(detail.uxDiagnostic);
}
export function isSpawnSessionErrorDetail(value) {
    return isConnectedServiceResumeUnreachableSpawnErrorDetail(value)
        || isConnectedServiceUxDiagnosticSpawnErrorDetail(value);
}
export function normalizeSpawnSessionErrorDetail(value) {
    const detail = asRecord(value);
    if (!detail)
        return undefined;
    return normalizeConnectedServiceResumeUnreachableDetail(detail)
        ?? normalizeConnectedServiceUxDiagnosticDetail(detail);
}
//# sourceMappingURL=spawnSession.js.map