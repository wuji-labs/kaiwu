import type { BugReportArtifactPayload } from './types.js';
export declare function hasAcceptedBugReportArtifactKind(acceptedKinds: readonly string[], ...kinds: string[]): boolean;
export declare function pushBugReportArtifact(list: BugReportArtifactPayload[], artifact: BugReportArtifactPayload, input: {
    maxArtifactBytes: number;
    acceptedKinds: string[];
}): void;
//# sourceMappingURL=artifacts.d.ts.map