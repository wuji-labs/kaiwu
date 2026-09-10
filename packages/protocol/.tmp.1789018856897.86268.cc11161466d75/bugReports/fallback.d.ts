import { type BugReportEnvironmentPayload, type BugReportFrequency, type BugReportSeverity } from './types.js';
export declare function normalizeBugReportReproductionSteps(raw: string | string[]): string[];
export declare function formatBugReportFallbackIssueBody(input: {
    summary: string;
    currentBehavior?: string;
    expectedBehavior?: string;
    reproductionSteps?: string[];
    frequency?: BugReportFrequency;
    severity?: BugReportSeverity;
    environment: BugReportEnvironmentPayload;
    whatChangedRecently?: string;
    diagnosticsIncluded: boolean;
}): string;
export declare function buildBugReportFallbackIssueUrl(input: {
    title: string;
    body: string;
    owner: string;
    repo: string;
}): string;
//# sourceMappingURL=fallback.d.ts.map