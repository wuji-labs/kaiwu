export type BugReportMachineDaemonStateLike = {
    daemonLogPath?: string | null;
    [key: string]: unknown;
};
export type BugReportMachineDaemonLogLike = {
    path?: string | null;
    [key: string]: unknown;
};
export type BugReportMachineRuntimeLike = {
    cwd?: string | null;
    [key: string]: unknown;
};
export type BugReportMachineStackContextLike = {
    stackName?: string | null;
    stackEnvPath?: string | null;
    runtimeStatePath?: string | null;
    logCandidates?: string[];
};
export type BugReportMachineDiagnosticsLike = {
    daemonState: BugReportMachineDaemonStateLike | null;
    daemonLogs: BugReportMachineDaemonLogLike[];
    runtime: BugReportMachineRuntimeLike;
    stackContext?: BugReportMachineStackContextLike | null;
};
export declare function sanitizeBugReportDaemonDiagnosticsPayload(input: BugReportMachineDiagnosticsLike): {
    daemonState: Record<string, unknown> | null;
    daemonLogs: Array<Record<string, unknown>>;
    runtime: Record<string, unknown>;
};
export declare function sanitizeBugReportStackContextPayload(input: BugReportMachineStackContextLike): {
    stackName: string | null;
    stackEnvPath: string | null;
    runtimeStatePath: string | null;
    logCandidates: string[];
};
//# sourceMappingURL=machineDiagnostics.d.ts.map