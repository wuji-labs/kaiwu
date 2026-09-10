import { z } from 'zod';
export declare const BugReportsCapabilitiesSchema: any;
export type BugReportsCapabilities = z.infer<typeof BugReportsCapabilitiesSchema>;
export declare const BUG_REPORT_DEFAULT_ACCEPTED_ARTIFACT_KINDS: readonly ["ui-mobile", "ui-desktop", "cli", "daemon", "server", "stack-service", "user-note", "session-log", "provider-transcript", "attachment"];
export declare const BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS: number;
export declare const DEFAULT_BUG_REPORTS_CAPABILITIES: BugReportsCapabilities;
export declare function coerceBugReportsCapabilitiesFromFeaturesPayload(payload: unknown): BugReportsCapabilities;
//# sourceMappingURL=bugReportsCapabilities.d.ts.map