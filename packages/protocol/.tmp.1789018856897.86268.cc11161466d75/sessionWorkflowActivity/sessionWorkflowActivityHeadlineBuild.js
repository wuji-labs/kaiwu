import { boundRecentActivityHeadlineEntries, partitionActivityHeadlineEntries, sortActiveActivityHeadlineEntries, } from '../sessionActivityHeadlineOrdering.js';
/**
 * Default terminal-history bound for the compact metadata headline. Only `recentRuns` is
 * bounded; `activeRuns` is never capped because active concurrency is provider behavior, not
 * a Happier-imposed limit. Terminal `activity/workflow_run.v1` records remain durable history.
 */
export const SESSION_WORKFLOW_ACTIVITY_RECENT_RUNS_LIMIT = 5;
const TERMINAL_WORKFLOW_RUN_STATUSES = new Set([
    'complete',
    'failed',
    'stopped',
    'cancelled',
]);
export function isTerminalWorkflowRunStatus(status) {
    return TERMINAL_WORKFLOW_RUN_STATUSES.has(status);
}
// Active-run attention priority: runs needing user attention (blocked) first, then active,
// then pending/unknown. Run statuses do not include a literal `pending`, but the comparator
// keeps that tier so the rule stays stable if a provider ever surfaces one. Ordinary progress
// timestamps intentionally do NOT participate in active ordering: workflows update frequently, and
// sorting by `updatedAt` makes the compact badge and popover reorder on every progress tick.
function activeRunStatusPriority(status) {
    switch (status) {
        case 'blocked':
            return 0;
        case 'active':
            return 1;
        case 'pending':
            return 2;
        default:
            return 3;
    }
}
/**
 * How the shared headline-ordering owner reads a workflow run. Ordering, bounding and the
 * "progress timestamps never touch the active side" rule live in
 * `../sessionActivityHeadlineOrdering.ts`, which the agent-activity headline also calls — this
 * module contributes only the workflow vocabulary's terminality, priority and projection.
 */
const WORKFLOW_RUN_HEADLINE_ACCESSORS = {
    id: (run) => run.runId,
    activePriority: (run) => activeRunStatusPriority(run.status),
    updatedAt: (run) => run.updatedAt,
};
/** Deterministic active-run ordering shared by every client so they agree on `primaryRunId`. */
export function sortActiveWorkflowRunHeadlines(runs) {
    return sortActiveActivityHeadlineEntries(runs, WORKFLOW_RUN_HEADLINE_ACCESSORS);
}
/**
 * `primaryRunId` is a derived hint, not a second source of truth. It is `null` when there are
 * no active runs; otherwise it is the first run after deterministic active-run sorting.
 */
export function resolvePrimaryWorkflowRunId(activeRuns) {
    const sorted = sortActiveWorkflowRunHeadlines(activeRuns);
    return sorted[0]?.runId ?? null;
}
/** Bound only terminal history; never bound active concurrency. */
export function boundRecentWorkflowRunHeadlines(terminalRuns, limit = SESSION_WORKFLOW_ACTIVITY_RECENT_RUNS_LIMIT) {
    const { recent, omittedCount } = boundRecentActivityHeadlineEntries(terminalRuns, WORKFLOW_RUN_HEADLINE_ACCESSORS, limit);
    if (omittedCount > 0) {
        return { recentRuns: recent, truncated: { reason: 'run_limit', omittedCount } };
    }
    return { recentRuns: recent };
}
/**
 * Project a run to the count-only headline field set. The producer guards the
 * "headline never holds workflow detail" invariant here (§3.3): a caller passing a
 * detail-bearing snapshot object can never leak phases/agents/previews into the compact
 * session-metadata headline, regardless of structural typing. Pairs with the strip-by-default
 * schema for defence in depth.
 */
export function projectWorkflowRunHeadline(run) {
    const projected = {
        runId: run.runId,
        title: run.title,
        status: run.status,
        updatedAt: run.updatedAt,
        recordRevision: run.recordRevision,
        recordUpdatedAt: run.recordUpdatedAt,
        totalAgents: run.totalAgents,
        completedAgents: run.completedAgents,
    };
    if (run.statusReason !== undefined)
        projected.statusReason = run.statusReason;
    if (run.workflowToolUseId !== undefined)
        projected.workflowToolUseId = run.workflowToolUseId;
    if (run.failedAgents !== undefined)
        projected.failedAgents = run.failedAgents;
    if (run.blockedAgents !== undefined)
        projected.blockedAgents = run.blockedAgents;
    return projected;
}
/**
 * Build the compact headline from a flat list of run headlines. Partitions active vs terminal
 * runs, keeps every active run, bounds terminal history, and computes a deterministic
 * `primaryRunId`. This is the single shared builder reused by the publisher and ported to
 * `../dev`, so multiple clients agree on ordering and primary selection.
 */
export function buildSessionWorkflowActivityHeadline(input) {
    const { active: activeRuns, recent: recentRuns, omittedCount } = partitionActivityHeadlineEntries({
        entries: input.runs,
        accessors: WORKFLOW_RUN_HEADLINE_ACCESSORS,
        isTerminal: (run) => isTerminalWorkflowRunStatus(run.status),
        // Project at the single producer chokepoint so detail can never reach the headline.
        project: projectWorkflowRunHeadline,
        recentLimit: input.recentRunsLimit ?? SESSION_WORKFLOW_ACTIVITY_RECENT_RUNS_LIMIT,
    });
    const headline = {
        v: 1,
        backendId: input.backendId,
        updatedAt: input.updatedAt,
        primaryRunId: activeRuns[0]?.runId ?? null,
        activeRuns,
    };
    if (input.agentId)
        headline.agentId = input.agentId;
    if (recentRuns.length > 0)
        headline.recentRuns = recentRuns;
    if (omittedCount > 0)
        headline.truncated = { reason: 'run_limit', omittedCount };
    return headline;
}
//# sourceMappingURL=sessionWorkflowActivityHeadlineBuild.js.map