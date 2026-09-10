import type { SessionWorkflowActivityHeadlineTruncationV1, SessionWorkflowActivityHeadlineV1, SessionWorkflowRunHeadlineV1 } from './sessionWorkflowActivityHeadlineV1.js';
import type { SessionWorkflowRunStatusV1 } from './sessionWorkflowRunSnapshotV1.js';
/**
 * Default terminal-history bound for the compact metadata headline. Only `recentRuns` is
 * bounded; `activeRuns` is never capped because active concurrency is provider behavior, not
 * a Happier-imposed limit. Terminal `activity/workflow_run.v1` records remain durable history.
 */
export declare const SESSION_WORKFLOW_ACTIVITY_RECENT_RUNS_LIMIT = 5;
export declare function isTerminalWorkflowRunStatus(status: SessionWorkflowRunStatusV1): boolean;
/** Deterministic active-run ordering shared by every client so they agree on `primaryRunId`. */
export declare function sortActiveWorkflowRunHeadlines(runs: readonly SessionWorkflowRunHeadlineV1[]): SessionWorkflowRunHeadlineV1[];
/**
 * `primaryRunId` is a derived hint, not a second source of truth. It is `null` when there are
 * no active runs; otherwise it is the first run after deterministic active-run sorting.
 */
export declare function resolvePrimaryWorkflowRunId(activeRuns: readonly SessionWorkflowRunHeadlineV1[]): string | null;
/** Bound only terminal history; never bound active concurrency. */
export declare function boundRecentWorkflowRunHeadlines(terminalRuns: readonly SessionWorkflowRunHeadlineV1[], limit?: number): {
    recentRuns: SessionWorkflowRunHeadlineV1[];
    truncated?: SessionWorkflowActivityHeadlineTruncationV1;
};
/**
 * Project a run to the count-only headline field set. The producer guards the
 * "headline never holds workflow detail" invariant here (§3.3): a caller passing a
 * detail-bearing snapshot object can never leak phases/agents/previews into the compact
 * session-metadata headline, regardless of structural typing. Pairs with the strip-by-default
 * schema for defence in depth.
 */
export declare function projectWorkflowRunHeadline(run: SessionWorkflowRunHeadlineV1): SessionWorkflowRunHeadlineV1;
export type BuildSessionWorkflowActivityHeadlineInput = Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    runs: readonly SessionWorkflowRunHeadlineV1[];
    recentRunsLimit?: number;
}>;
/**
 * Build the compact headline from a flat list of run headlines. Partitions active vs terminal
 * runs, keeps every active run, bounds terminal history, and computes a deterministic
 * `primaryRunId`. This is the single shared builder reused by the publisher and ported to
 * `../dev`, so multiple clients agree on ordering and primary selection.
 */
export declare function buildSessionWorkflowActivityHeadline(input: BuildSessionWorkflowActivityHeadlineInput): SessionWorkflowActivityHeadlineV1;
//# sourceMappingURL=sessionWorkflowActivityHeadlineBuild.d.ts.map