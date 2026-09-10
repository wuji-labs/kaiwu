import type { BugReportDeploymentType } from './types.js';
export declare function normalizeBugReportProviderUrl(input: string | null | undefined): string | null;
export declare function sanitizeBugReportArtifactFileSegment(input: string): string;
export declare function sanitizeBugReportArtifactPath(path: string | null | undefined): string | null;
export declare function sanitizeBugReportUrl(input: string | null | undefined): string | undefined;
export declare function inferBugReportDeploymentTypeFromServerUrl(serverUrl: string): BugReportDeploymentType;
//# sourceMappingURL=sanitize.d.ts.map