import type { ExecutionRunStatus } from '../../executionRunListRequest.js';
import type { AgentActivityStatusV1 } from '../agentActivityStatusV1.js';
/**
 * `ExecutionRunStatus` (daemon execution-run registry) -> presentation status.
 *
 * The source enum is unchanged and still the wire contract. No `default` arm: a value added
 * upstream must fail to compile here.
 *
 * `timeout` has its own presentation status. Collapsing it into `succeeded` is defect D-1 — a run
 * the daemon timed out rendering as a green success is a lie the user cannot see through, and
 * timing out has a different recovery (raise the budget) than failing (read the error).
 */
export declare function fromExecutionRunStatus(status: ExecutionRunStatus): AgentActivityStatusV1;
//# sourceMappingURL=fromExecutionRunStatus.d.ts.map