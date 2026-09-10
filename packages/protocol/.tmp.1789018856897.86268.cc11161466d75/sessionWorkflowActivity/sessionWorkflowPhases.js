/**
 * `phases[]` is authoritative for phase title/order once a `workflow_phase` entry exists.
 *
 * If an agent-level `phaseTitle` conflicts with an existing `phases[].title` for the same
 * phase, the phase row title wins and the agent value is treated as supplementary/stale.
 * Centralizing this rule prevents the normalizer, popover, and transcript card from drifting.
 */
export function resolveWorkflowAgentPhaseTitle(snapshot, agent) {
    const phase = findWorkflowPhaseForAgent(snapshot.phases, agent);
    const phaseTitle = phase?.title?.trim();
    if (phaseTitle)
        return phaseTitle;
    const agentPhaseTitle = agent.phaseTitle?.trim();
    return agentPhaseTitle ? agentPhaseTitle : undefined;
}
/**
 * Match an agent to its owning phase. Membership (`phase.agentIds`) is the strongest signal;
 * otherwise fall back to matching `phase.order` against the agent's `phaseIndex`.
 */
export function findWorkflowPhaseForAgent(phases, agent) {
    const byMembership = phases.find((phase) => phase.agentIds.includes(agent.id));
    if (byMembership)
        return byMembership;
    if (typeof agent.phaseIndex === 'number') {
        return phases.find((phase) => phase.order === agent.phaseIndex);
    }
    return undefined;
}
//# sourceMappingURL=sessionWorkflowPhases.js.map