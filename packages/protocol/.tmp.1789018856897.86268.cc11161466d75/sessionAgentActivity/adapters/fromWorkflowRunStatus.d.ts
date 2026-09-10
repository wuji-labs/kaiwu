import type { SessionWorkflowRunStatusV1 } from '../../sessionWorkflowActivity/sessionWorkflowRunSnapshotV1.js';
import type { AgentActivityStatusV1 } from '../agentActivityStatusV1.js';
/**
 * `SessionWorkflowRunStatusV1` (durable `activity/workflow_run.v1` record) -> presentation status.
 *
 * The source enum is unchanged and still the wire contract; this is the boundary where it becomes
 * presentable. No `default` arm: a value added upstream must fail to compile here.
 */
export declare function fromWorkflowRunStatus(status: SessionWorkflowRunStatusV1): AgentActivityStatusV1;
//# sourceMappingURL=fromWorkflowRunStatus.d.ts.map