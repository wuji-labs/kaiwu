import type { SessionWorkflowAgentStatusV1 } from '../../sessionWorkflowActivity/sessionWorkflowRunSnapshotV1.js';
import type { AgentActivityStatusV1 } from '../agentActivityStatusV1.js';
/**
 * `SessionWorkflowAgentStatusV1` (one agent inside a durable workflow run) -> presentation status.
 *
 * The source enum is unchanged and still the wire contract. No `default` arm: a value added
 * upstream must fail to compile here.
 */
export declare function fromWorkflowAgentStatus(status: SessionWorkflowAgentStatusV1): AgentActivityStatusV1;
//# sourceMappingURL=fromWorkflowAgentStatus.d.ts.map