export function decideRuntimeIdleAdmission(projection) {
    if (projection.state === 'idle') {
        return {
            decision: 'allow',
            revision: projection.revision,
        };
    }
    return {
        decision: 'defer',
        reason: projection.state,
        revision: projection.revision,
    };
}
//# sourceMappingURL=admission.js.map