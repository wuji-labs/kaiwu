import { z } from 'zod';
import { type ConnectedServiceUxDiagnosticV1 } from './connect/connectedServiceUxDiagnostics.js';
/** Fresh execution authority is bound to an exact user request and, when present, its durable revision. */
export declare const SpawnSessionExecutionAuthorizationSchema: any;
export type SpawnSessionExecutionAuthorization = z.infer<typeof SpawnSessionExecutionAuthorizationSchema>;
/**
 * One-shot first user input carried by a fresh-session spawn until the runner can commit it to
 * Pending. The opaque local id is the cross-boundary de-duplication identity.
 */
export declare const PendingFirstInputV1Schema: any;
export type PendingFirstInputV1 = z.infer<typeof PendingFirstInputV1Schema>;
export declare const SPAWN_SESSION_ERROR_CODES: {
    readonly INVALID_REQUEST: "INVALID_REQUEST";
    readonly INVALID_ENVIRONMENT_VARIABLES: "INVALID_ENVIRONMENT_VARIABLES";
    readonly AUTH_ENV_UNEXPANDED: "AUTH_ENV_UNEXPANDED";
    readonly RESUME_NOT_SUPPORTED: "RESUME_NOT_SUPPORTED";
    readonly RESUME_MISSING_ENCRYPTION_KEY: "RESUME_MISSING_ENCRYPTION_KEY";
    readonly RESUME_UNSUPPORTED_ENCRYPTION_VARIANT: "RESUME_UNSUPPORTED_ENCRYPTION_VARIANT";
    readonly DIRECTORY_CREATE_FAILED: "DIRECTORY_CREATE_FAILED";
    readonly SPAWN_VALIDATION_FAILED: "SPAWN_VALIDATION_FAILED";
    readonly SPAWN_NO_PID: "SPAWN_NO_PID";
    readonly CHILD_EXITED_BEFORE_WEBHOOK: "CHILD_EXITED_BEFORE_WEBHOOK";
    readonly SESSION_WEBHOOK_TIMEOUT: "SESSION_WEBHOOK_TIMEOUT";
    readonly ACCOUNT_SCOPE_CHANGED: "ACCOUNT_SCOPE_CHANGED";
    readonly SPAWN_FAILED: "SPAWN_FAILED";
    readonly DAEMON_RPC_UNAVAILABLE: "DAEMON_RPC_UNAVAILABLE";
    readonly DAEMON_UPGRADE_REQUIRED: "DAEMON_UPGRADE_REQUIRED";
    readonly UNEXPECTED: "UNEXPECTED";
};
export type SpawnSessionErrorCode = (typeof SPAWN_SESSION_ERROR_CODES)[keyof typeof SPAWN_SESSION_ERROR_CODES];
/**
 * Structured, machine-recognizable detail attached to a spawn error so clients can react
 * programmatically instead of parsing the human-readable `errorMessage`.
 *
 * This is a discriminated union keyed by `kind`; it is ADDITIVE and OPTIONAL on the spawn error
 * result. Existing consumers that only read `errorCode`/`errorMessage` keep working unchanged.
 */
export declare const SPAWN_SESSION_ERROR_DETAIL_KINDS: {
    /**
     * A connected-service auth switch/resume fail-closed because the resumed session could not be
     * proven reachable in the materialized target before the vendor launched (K1 §2 gate). Surfaced
     * under `SPAWN_VALIDATION_FAILED` (the enum value is unchanged for back-compat); this detail
     * carries the structured continuity reason so the client can show the "switch unavailable"
     * explanation and offer "start fresh under the new account".
     */
    readonly CONNECTED_SERVICE_RESUME_UNREACHABLE: "connected_service_resume_unreachable";
    /**
     * A connected-service spawn failure whose useful, protocol-owned UI detail is the diagnostic
     * itself. This covers fail-closed errors that are not resume-reachability probes, such as missing
     * materialization identity during existing-session attach.
     */
    readonly CONNECTED_SERVICE_UX_DIAGNOSTIC: "connected_service_ux_diagnostic";
};
export type SpawnSessionErrorDetailKind = (typeof SPAWN_SESSION_ERROR_DETAIL_KINDS)[keyof typeof SPAWN_SESSION_ERROR_DETAIL_KINDS];
/**
 * The continuity failure code mirrored from the CLI switch-FSM / spawn re-verify taxonomy
 * (`ConnectedServiceSpawnResumeUnreachableError.errorCode`). It is the only code the spawn-path
 * reachability gate emits, so it is modeled as a literal rather than the broader connect-error enum.
 */
export type ConnectedServiceResumeUnreachableContinuityCode = 'provider_session_state_unavailable_for_resume';
export type ConnectedServiceResumeUnreachableSpawnErrorDetail = Readonly<{
    kind: typeof SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_RESUME_UNREACHABLE;
    /** Mirrors `ConnectedServiceSpawnResumeUnreachableError.errorCode`. */
    continuityErrorCode: ConnectedServiceResumeUnreachableContinuityCode;
    /** Mirrors `ConnectedServiceSpawnResumeUnreachableError.failurePhase` (the switch-FSM phase). */
    failurePhase: 'continuity';
    /** The catalog agent id of the backend whose resume was unreachable (e.g. `pi`, `codex`). */
    agentId: string;
    /** A UI-safe machine-readable reason from the reachability probe. */
    reason: string;
    /** UI-safe diagnostic payload. Daemon-local paths/provider resume ids must not be included here. */
    uxDiagnostic: ConnectedServiceUxDiagnosticV1;
}>;
export type ConnectedServiceUxDiagnosticSpawnErrorDetail = Readonly<{
    kind: typeof SPAWN_SESSION_ERROR_DETAIL_KINDS.CONNECTED_SERVICE_UX_DIAGNOSTIC;
    uxDiagnostic: ConnectedServiceUxDiagnosticV1;
}>;
export type SpawnSessionErrorDetail = ConnectedServiceResumeUnreachableSpawnErrorDetail | ConnectedServiceUxDiagnosticSpawnErrorDetail;
export declare function isConnectedServiceResumeUnreachableSpawnErrorDetail(value: unknown): value is ConnectedServiceResumeUnreachableSpawnErrorDetail;
export declare function isConnectedServiceUxDiagnosticSpawnErrorDetail(value: unknown): value is ConnectedServiceUxDiagnosticSpawnErrorDetail;
export declare function isSpawnSessionErrorDetail(value: unknown): value is SpawnSessionErrorDetail;
export declare function normalizeSpawnSessionErrorDetail(value: unknown): SpawnSessionErrorDetail | undefined;
export type SpawnSessionResult = {
    type: 'success';
    sessionId?: string;
    spawnNonce?: string;
    sessionIdStatus?: 'available' | 'pending';
    /** Daemon acknowledgement that this request carried first-input custody into its spawn owner. */
    pendingFirstInputAccepted?: boolean;
} | {
    type: 'requestToApproveDirectoryCreation';
    directory: string;
} | {
    type: 'error';
    errorCode: SpawnSessionErrorCode;
    errorMessage: string;
    errorDetail?: SpawnSessionErrorDetail;
};
//# sourceMappingURL=spawnSession.d.ts.map