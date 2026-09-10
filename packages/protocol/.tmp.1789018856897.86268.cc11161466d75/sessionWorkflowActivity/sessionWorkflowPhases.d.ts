import type { SessionWorkflowAgentSnapshotV1, SessionWorkflowPhaseSnapshotV1 } from './sessionWorkflowRunSnapshotV1.js';
/**
 * `phases[]` is authoritative for phase title/order once a `workflow_phase` entry exists.
 *
 * If an agent-level `phaseTitle` conflicts with an existing `phases[].title` for the same
 * phase, the phase row title wins and the agent value is treated as supplementary/stale.
 * Centralizing this rule prevents the normalizer, popover, and transcript card from drifting.
 */
export declare function resolveWorkflowAgentPhaseTitle(snapshot: Readonly<{
    phases: readonly Pick<SessionWorkflowPhaseSnapshotV1, 'id' | 'title' | 'order' | 'agentIds'>[];
}>, agent: Readonly<Pick<SessionWorkflowAgentSnapshotV1, 'id' | 'phaseIndex' | 'phaseTitle'>>): string | undefined;
/**
 * Match an agent to its owning phase. Membership (`phase.agentIds`) is the strongest signal;
 * otherwise fall back to matching `phase.order` against the agent's `phaseIndex`.
 */
export declare function findWorkflowPhaseForAgent<Phase extends Pick<SessionWorkflowPhaseSnapshotV1, 'order' | 'agentIds'>>(phases: readonly Phase[], agent: Readonly<Pick<SessionWorkflowAgentSnapshotV1, 'id' | 'phaseIndex'>>): Phase | undefined;
//# sourceMappingURL=sessionWorkflowPhases.d.ts.map