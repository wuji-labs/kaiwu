import { z } from 'zod';
/**
 * Compact, count-only headline for one workflow run.
 *
 * The headline is a derived live pointer published into session metadata. It carries only
 * the fields needed for compact UI display + cache invalidation: ids, title, status, exact
 * counts, and the durable-record pointer (`recordRevision`/`recordUpdatedAt`). Phase/agent
 * trees, previews, metrics, and raw payloads live only in the `activity/workflow_run.v1`
 * system record — never here.
 */
export declare const SessionWorkflowRunHeadlineV1Schema: any;
export type SessionWorkflowRunHeadlineV1 = z.infer<typeof SessionWorkflowRunHeadlineV1Schema>;
export declare const SessionWorkflowActivityHeadlineTruncationV1Schema: any;
export type SessionWorkflowActivityHeadlineTruncationV1 = z.infer<typeof SessionWorkflowActivityHeadlineTruncationV1Schema>;
export declare const SessionWorkflowActivityHeadlineV1Schema: any;
export type SessionWorkflowActivityHeadlineV1 = z.infer<typeof SessionWorkflowActivityHeadlineV1Schema>;
//# sourceMappingURL=sessionWorkflowActivityHeadlineV1.d.ts.map