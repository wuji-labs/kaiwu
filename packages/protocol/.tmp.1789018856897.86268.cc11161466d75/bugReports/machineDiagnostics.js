import { sanitizeBugReportArtifactPath } from './sanitize.js';
export function sanitizeBugReportDaemonDiagnosticsPayload(input) {
    return {
        daemonState: input.daemonState
            ? {
                ...input.daemonState,
                daemonLogPath: sanitizeBugReportArtifactPath(input.daemonState.daemonLogPath),
            }
            : null,
        daemonLogs: input.daemonLogs.map((entry) => ({
            ...entry,
            path: sanitizeBugReportArtifactPath(entry.path),
        })),
        runtime: {
            ...input.runtime,
            cwd: sanitizeBugReportArtifactPath(input.runtime.cwd),
        },
    };
}
export function sanitizeBugReportStackContextPayload(input) {
    return {
        stackName: input.stackName ?? null,
        stackEnvPath: sanitizeBugReportArtifactPath(input.stackEnvPath),
        runtimeStatePath: sanitizeBugReportArtifactPath(input.runtimeStatePath),
        logCandidates: (input.logCandidates ?? [])
            .map((entry) => sanitizeBugReportArtifactPath(entry))
            .filter((entry) => Boolean(entry)),
    };
}
//# sourceMappingURL=machineDiagnostics.js.map