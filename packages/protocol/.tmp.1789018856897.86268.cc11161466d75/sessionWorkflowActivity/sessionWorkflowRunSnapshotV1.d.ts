import { z } from 'zod';
/**
 * Provider-agnostic durable workflow run snapshot.
 *
 * Persisted as a session system record under namespace `activity`, kind `workflow_run.v1`.
 * One record holds the full detail for one workflow run: ordered `phases[]` and all
 * `agents[]`. Hundreds of agents must round-trip without dropping ids or corrupting counts,
 * so the schema bounds only preview strings — never ids, status, counters, or exact counts.
 *
 * This contract is provider-neutral. Claude-native event shapes (`task_progress`,
 * `workflow_progress[]`, `Workflow {script}`) are normalized into these fields by
 * Claude-owned CLI code; protocol never parses provider-native events.
 */
export declare const SESSION_WORKFLOW_RUN_SNAPSHOT_SUMMARY_MAX = 8000;
export declare const SESSION_WORKFLOW_RUN_SNAPSHOT_RESULT_PREVIEW_MAX = 2000;
export declare const SESSION_WORKFLOW_RUN_SNAPSHOT_TITLE_MAX = 4000;
/**
 * Provider-agnostic projection/normalizer version for durable workflow run records.
 * Required separately from schema `v` so pre-version, valid-but-stale workflow projections are
 * rejected without changing provider-native Claude event parsing.
 */
export declare const SESSION_WORKFLOW_RUN_SNAPSHOT_PROJECTION_VERSION = 1;
export declare const SessionWorkflowRunStatusV1Schema: any;
export type SessionWorkflowRunStatusV1 = z.infer<typeof SessionWorkflowRunStatusV1Schema>;
/**
 * Optional reason qualifier for a workflow run's status. Additive and forward-compatible:
 * today only `interrupted` is emitted (a run that was `active`/`blocked`/`unknown` when the CLI
 * process died or shut down and was synthetically terminated to `stopped` by startup
 * reconciliation / graceful teardown). Clients may render a distinct tone; absence means the
 * status was reached by a real provider transition.
 */
export declare const SessionWorkflowRunStatusReasonV1Schema: any;
export type SessionWorkflowRunStatusReasonV1 = z.infer<typeof SessionWorkflowRunStatusReasonV1Schema>;
export declare const SessionWorkflowAgentStatusV1Schema: any;
export type SessionWorkflowAgentStatusV1 = z.infer<typeof SessionWorkflowAgentStatusV1Schema>;
export declare const SessionWorkflowPhaseSnapshotV1Schema: any;
export type SessionWorkflowPhaseSnapshotV1 = z.infer<typeof SessionWorkflowPhaseSnapshotV1Schema>;
export declare const SessionWorkflowAgentSnapshotV1Schema: any;
export type SessionWorkflowAgentSnapshotV1 = z.infer<typeof SessionWorkflowAgentSnapshotV1Schema>;
export declare const SessionWorkflowRunSnapshotV1Schema: any;
export type SessionWorkflowRunSnapshotV1 = z.infer<typeof SessionWorkflowRunSnapshotV1Schema>;
//# sourceMappingURL=sessionWorkflowRunSnapshotV1.d.ts.map