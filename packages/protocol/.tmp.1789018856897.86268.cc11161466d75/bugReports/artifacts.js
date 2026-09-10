import { redactBugReportSensitiveText, trimBugReportTextToMaxBytes } from './redaction.js';
function shouldIncludeBugReportArtifact(kind, acceptedKinds) {
    if (acceptedKinds.length === 0)
        return true;
    return acceptedKinds.includes(kind);
}
export function hasAcceptedBugReportArtifactKind(acceptedKinds, ...kinds) {
    if (acceptedKinds.length === 0)
        return true;
    return kinds.some((kind) => acceptedKinds.includes(kind));
}
export function pushBugReportArtifact(list, artifact, input) {
    if (!shouldIncludeBugReportArtifact(artifact.sourceKind, input.acceptedKinds))
        return;
    const content = trimBugReportTextToMaxBytes(redactBugReportSensitiveText(artifact.content), input.maxArtifactBytes);
    if (!content.trim())
        return;
    list.push({ ...artifact, content });
}
//# sourceMappingURL=artifacts.js.map