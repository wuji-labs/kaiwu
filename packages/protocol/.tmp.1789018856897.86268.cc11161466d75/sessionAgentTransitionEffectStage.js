function buildCurrentViewCommitted(localId) {
    return Object.freeze({
        accepted: () => ({ type: 'accepted', localId }),
        committed: (code) => ({ type: 'partially_applied', localId, applied: 'current_view_committed', code }),
    });
}
function buildSourceStopped(localId) {
    return Object.freeze({
        sourceStopped: (code) => ({ type: 'partially_applied', localId, applied: 'source_stopped', code }),
        outcomeUnknown: () => ({ type: 'outcome_unknown', localId }),
        cutoverCommitted: () => buildCurrentViewCommitted(localId),
    });
}
function buildSourceFenced(localId, reopen) {
    return Object.freeze({
        rejected: async (code) => {
            await reopen();
            return { type: 'rejected', code, sourceEffect: 'none' };
        },
        outcomeUnknown: async () => {
            await reopen();
            return { type: 'outcome_unknown', localId };
        },
        stopConfirmed: () => buildSourceStopped(localId),
    });
}
/**
 * Open the effect ledger for one transition invocation. Call it once, at the
 * top of the flow, and thread the returned handle forward: the handle in scope
 * is the proof of how far the transition got.
 */
export function beginSessionAgentTransitionEffects(params) {
    const { localId } = params;
    return Object.freeze({
        rejected: (code) => ({ type: 'rejected', code, sourceEffect: 'none' }),
        outcomeUnknown: () => ({ type: 'outcome_unknown', localId }),
        withInputFence: (reopen) => buildSourceFenced(localId, reopen),
        stopConfirmed: () => buildSourceStopped(localId),
        cutoverObservedCommitted: () => buildCurrentViewCommitted(localId),
    });
}
/**
 * The one rejection raised before the transition was dispatched at all: the
 * request failed schema validation, or the process holds no credentials, so no
 * code addressed the Session and there is no `localId` to correlate.
 *
 * This is deliberately a separate, awkwardly named export rather than a second
 * way to build a rejection. Inside the flow the stage handle is the only
 * source of arms; reaching for this there is visibly wrong.
 */
export function rejectUndispatchedSessionAgentTransition(code) {
    return { type: 'rejected', code, sourceEffect: 'none' };
}
//# sourceMappingURL=sessionAgentTransitionEffectStage.js.map