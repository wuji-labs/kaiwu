import { z } from 'zod';
export const SESSION_RUNNER_RUNTIME_STATE_FIELD_ID = 'runtime.sessionRunner';
const SessionRunnerSessionIdV1Schema = z.string().trim().min(1);
const SessionRunnerIdentityV1Schema = z.string().trim().min(1);
const SessionRunnerPidV1Schema = z.number().int().positive();
const SessionRunnerTimestampMsV1Schema = z.number().int().nonnegative();
const SessionRunnerDiagnosticsV1Schema = z.record(z.string().trim().min(1), z.unknown());
const NullableIdentityFieldV1Schema = SessionRunnerIdentityV1Schema.nullable().optional();
export const SESSION_RUNNER_RESTART_MODES_V1 = [
    'if_stale',
    'force_current_cli',
];
export const SessionRunnerRestartModeV1Schema = z.enum(SESSION_RUNNER_RESTART_MODES_V1);
export const SESSION_RUNNER_RESTART_REASONS_V1 = [
    'ui_stale_runner_banner',
    'daemon_restart_session_runners',
    'daemon_restart_session_runners_command',
    'self_update_interactive_prompt',
    'doctor_repair',
    'restart_session_runners_on_update_config',
    'daemon_dist_generation_rollout',
];
export const SessionRunnerRestartReasonV1Schema = z.enum(SESSION_RUNNER_RESTART_REASONS_V1);
export const SESSION_RUNNER_RESTART_DISABLED_REASONS = [
    'not_daemon_started',
    'not_remote_started',
    'not_active',
    'no_tracked_process',
    'missing_resume_identity',
    'missing_spawn_options',
    'missing_credentials',
    'unsupported_backend',
    'turn_in_progress',
    'approval_pending',
    'terminal_detached',
    'terminal_host_attached',
    'non_destructive_refresh_unsupported',
    'windows_hosted_runner',
    'restart_already_running',
    'current_entrypoint_unknown',
    'runner_entrypoint_unknown',
    'runner_generation_unattested',
    'unsupported_daemon_version',
];
export const SessionRunnerRestartDisabledReasonSchema = z.enum(SESSION_RUNNER_RESTART_DISABLED_REASONS);
export const SESSION_RUNNER_RESTART_STATUSES_V1 = [
    'restarted',
    'already_current',
    'dry_run_restartable',
    'not_found',
    'not_tracked',
    'not_daemon_started',
    'runner_not_active',
    'version_unknown',
    'runner_identity_changed',
    'busy',
    'missing_resume_snapshot',
    'missing_spawn_options',
    'unsupported_daemon',
    'ineligible',
    'stop_failed',
    'spawn_failed',
    'partial_failure',
];
export const RestartSessionRunnerStatusV1Schema = z.enum(SESSION_RUNNER_RESTART_STATUSES_V1);
export const RestartSessionRunnerRequestV1Schema = z
    .object({
    sessionId: SessionRunnerSessionIdV1Schema,
    mode: SessionRunnerRestartModeV1Schema.optional(),
    dryRun: z.boolean().optional(),
    reason: SessionRunnerRestartReasonV1Schema,
    expectedRunnerPid: SessionRunnerPidV1Schema.nullable().optional(),
    expectedProcessCommandHash: NullableIdentityFieldV1Schema,
    expectedRunnerEntrypointIdentity: NullableIdentityFieldV1Schema,
})
    .strict();
export const RestartAllSessionRunnersRequestV1Schema = z
    .object({
    mode: SessionRunnerRestartModeV1Schema,
    dryRun: z.boolean().optional(),
    reason: SessionRunnerRestartReasonV1Schema,
})
    .strict();
const RestartSessionRunnerEndpointSummaryV1Schema = z
    .object({
    pid: SessionRunnerPidV1Schema.nullable().optional(),
    cliVersion: NullableIdentityFieldV1Schema,
    entrypointVersion: NullableIdentityFieldV1Schema,
    processCommandHash: NullableIdentityFieldV1Schema,
})
    .strict();
export const RestartSessionRunnerResultV1Schema = z
    .object({
    ok: z.boolean(),
    status: RestartSessionRunnerStatusV1Schema,
    sessionId: SessionRunnerSessionIdV1Schema,
    previous: RestartSessionRunnerEndpointSummaryV1Schema.optional(),
    next: RestartSessionRunnerEndpointSummaryV1Schema.optional(),
    reasonCode: SessionRunnerRestartDisabledReasonSchema.nullable().optional(),
    diagnostics: SessionRunnerDiagnosticsV1Schema.optional(),
})
    .strict();
export const RestartAllSessionRunnersResultV1Schema = z
    .object({
    ok: z.boolean(),
    mode: SessionRunnerRestartModeV1Schema,
    requestedCount: z.number().int().nonnegative(),
    restartedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    results: z.array(RestartSessionRunnerResultV1Schema),
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.requestedCount !== value.results.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['requestedCount'],
            message: 'requestedCount must match results length',
        });
    }
    if (value.restartedCount + value.skippedCount + value.failedCount !== value.requestedCount) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['requestedCount'],
            message: 'restart result counts must sum to requestedCount',
        });
    }
});
export const SessionRunnerEntrypointSourceV1Schema = z.enum([
    'structured_state',
    'process_command',
    'launch_spec',
    'unknown',
]);
export const SessionRunnerDaemonEntrypointSourceV1Schema = z.enum([
    'launch_spec',
    'packaged_runtime',
    'override',
    'unknown',
]);
export const SessionRunnerStartedByV1Schema = z.enum(['daemon', 'local', 'unknown']);
export const SessionRunnerStartingModeV1Schema = z.enum(['remote', 'local', 'unknown']);
export const SessionRunnerVersionStateV1Schema = z.enum(['current', 'stale', 'unknown']);
export const SessionRunnerRuntimeStatusSourceV1Schema = z.enum([
    'daemon_tracking',
    'runner_marker',
    'runner_report',
    'process_command_inferred',
    'unknown',
]);
const SessionRunnerRuntimeRunnerV1Schema = z
    .object({
    pid: SessionRunnerPidV1Schema.nullable().optional(),
    runtimeId: NullableIdentityFieldV1Schema,
    cliVersion: NullableIdentityFieldV1Schema,
    entrypointVersion: NullableIdentityFieldV1Schema,
    processCommandHash: NullableIdentityFieldV1Schema,
    entrypointSource: SessionRunnerEntrypointSourceV1Schema,
    startedBy: SessionRunnerStartedByV1Schema,
    startingMode: SessionRunnerStartingModeV1Schema,
})
    .strict();
const SessionRunnerRuntimeDaemonV1Schema = z
    .object({
    cliVersion: NullableIdentityFieldV1Schema,
    startedWithCliVersion: NullableIdentityFieldV1Schema,
    currentEntrypointVersion: NullableIdentityFieldV1Schema,
    currentEntrypointSource: SessionRunnerDaemonEntrypointSourceV1Schema,
})
    .strict();
const SessionRunnerPlannedRestartStateV1Schema = z
    .object({
    supported: z.boolean(),
    eligible: z.boolean(),
    disabledReason: SessionRunnerRestartDisabledReasonSchema.nullable().optional(),
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.eligible && !value.supported) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['eligible'],
            message: 'eligible planned restart requires supported planned restart',
        });
    }
});
export const SessionRunnerRuntimeStateV1Schema = z
    .object({
    v: z.literal(1),
    sessionId: SessionRunnerSessionIdV1Schema,
    machineId: NullableIdentityFieldV1Schema,
    daemonId: NullableIdentityFieldV1Schema,
    observedAtMs: SessionRunnerTimestampMsV1Schema,
    runner: SessionRunnerRuntimeRunnerV1Schema,
    daemon: SessionRunnerRuntimeDaemonV1Schema,
    versionState: SessionRunnerVersionStateV1Schema,
    statusSource: SessionRunnerRuntimeStatusSourceV1Schema,
    plannedRestart: SessionRunnerPlannedRestartStateV1Schema,
})
    .strict();
export const SessionRunnerStatusGetRequestV1Schema = z
    .object({
    sessionId: SessionRunnerSessionIdV1Schema,
})
    .strict();
//# sourceMappingURL=contract.js.map