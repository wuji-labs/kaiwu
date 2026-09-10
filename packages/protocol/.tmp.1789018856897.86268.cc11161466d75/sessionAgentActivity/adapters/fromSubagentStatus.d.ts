import { z } from 'zod';
import type { AgentActivityStatusV1 } from '../agentActivityStatusV1.js';
/**
 * Boundary vocabulary for the client-derived subagent status.
 *
 * The canonical owner is `SessionSubagentStatus` at
 * `apps/ui/sources/sync/domains/session/subagents/types.ts`. It is derived from transcript
 * observation rather than published on the wire, and `packages/protocol` cannot import from
 * `apps/ui`, so this schema is the boundary mirror the adapter is typed against — it does not take
 * ownership away from the UI type and must stay in step with it.
 *
 * The lock has two halves: a UI caller passing a `SessionSubagentStatus` straight into
 * `fromSubagentStatus` fails to compile when the mirror is missing a member, and
 * `sessionSubagentStatusProtocolParity.test.ts` in `apps/ui` asserts set equality so a member added
 * here without a UI counterpart (or vice versa) fails loudly instead of drifting. That test lives
 * on the UI side because only that side can see both vocabularies.
 */
export declare const SESSION_SUBAGENT_STATUS_SOURCES_V1: readonly ["running", "succeeded", "failed", "timedOut", "cancelled", "terminated", "unknown"];
export declare const SessionSubagentStatusSourceV1Schema: any;
export type SessionSubagentStatusSourceV1 = z.infer<typeof SessionSubagentStatusSourceV1Schema>;
/**
 * Subagent status -> presentation status. No `default` arm: a value added upstream must fail to
 * compile here.
 */
export declare function fromSubagentStatus(status: SessionSubagentStatusSourceV1): AgentActivityStatusV1;
//# sourceMappingURL=fromSubagentStatus.d.ts.map