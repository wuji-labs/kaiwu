const CONNECTED_SERVICE_MEMBER_RUNTIME_BLOCKER_CLEAR_KEYS = [
    'cooldownStartedAtMs',
    'cooldownUntilMs',
    'exhaustedUntilMs',
    'quotaExhaustedUntilMs',
    'rateLimitedUntilMs',
    'capacityLimitedUntilMs',
    'authInvalidUntilMs',
    'planUnavailableUntilMs',
    'validationBlockedUntilMs',
    'credentialHealthStatus',
    'lastFailureKind',
    'lastObservedAtMs',
];
function futureTimestamp(value, nowMs) {
    return typeof value === 'number' && Number.isFinite(value) && value > nowMs ? value : null;
}
export function readConnectedServiceManualActiveProfileRuntimeBlocker(state, nowMs) {
    const resetAtValues = [
        state.cooldownUntilMs,
        state.exhaustedUntilMs,
        state.quotaExhaustedUntilMs,
        state.rateLimitedUntilMs,
    ]
        .map((value) => futureTimestamp(value, nowMs))
        .filter((value) => value !== null);
    return resetAtValues.length > 0 ? { resetAtMs: Math.max(...resetAtValues) } : null;
}
export function clearConnectedServiceAuthGroupMemberRuntimeBlockers(state) {
    let changed = false;
    const next = { ...state };
    for (const key of CONNECTED_SERVICE_MEMBER_RUNTIME_BLOCKER_CLEAR_KEYS) {
        if (next[key] !== undefined) {
            delete next[key];
            changed = true;
        }
    }
    return changed ? next : state;
}
//# sourceMappingURL=connectedServiceAuthGroupMemberRuntimeStatePolicy.js.map