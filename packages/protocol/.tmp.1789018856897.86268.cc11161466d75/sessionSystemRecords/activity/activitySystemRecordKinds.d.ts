import { z } from 'zod';
export declare const SESSION_SYSTEM_RECORD_ACTIVITY_NAMESPACE: "activity";
/**
 * Durable record kinds in the `activity` namespace.
 *
 * Append only. `apps/cli/src/session/systemRecords/activity/activitySystemRecords.ts` names its
 * kinds by tuple index, so reordering this list silently retargets a publisher.
 */
export declare const ACTIVITY_SESSION_SYSTEM_RECORD_KINDS: readonly ["workflow_run.v1", "background_task.v1"];
export declare const ActivitySessionSystemRecordKindSchema: any;
export type ActivitySessionSystemRecordKind = z.infer<typeof ActivitySessionSystemRecordKindSchema>;
/**
 * Stable, idempotent local id for one workflow run's durable `activity/workflow_run.v1` detail
 * record. This is the canonical join key shared by the CLI publisher and the UI reader so both write
 * and read paths agree on the record address; the same `runId` always maps to the same record.
 */
export declare function buildWorkflowRunSystemRecordLocalId(params: Readonly<{
    runId: string;
}>): string;
/**
 * Stable, idempotent local id for one background task's durable `activity/background_task.v1`
 * record, shared by the CLI publisher and every reader exactly as the workflow builder is.
 *
 * It throws where the workflow builder tolerates an empty component, and that difference is
 * deliberate: `runId` reaches its builder from a schema that already requires a non-empty string,
 * whereas a task id is read off a provider event. An empty one would address every unidentifiable
 * task to the single record `activity:background_task:v1:` — each task overwriting the last, with
 * nothing failing loudly.
 */
export declare function buildBackgroundTaskSystemRecordLocalId(params: Readonly<{
    taskId: string;
}>): string;
//# sourceMappingURL=activitySystemRecordKinds.d.ts.map