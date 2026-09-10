import { redactBugReportSensitiveText } from '../../bugReports/redaction.js';
import { BACKGROUND_TASK_LABEL_MAX } from './backgroundTaskRecordV1.js';
export const BACKGROUND_TASK_LABEL_TRUNCATION_SUFFIX = '…';
const HIGH_ENTROPY_REDACTION = '[REDACTED]';
/**
 * An absolute-path-looking run: POSIX `/…`, Windows `C:\…`, or a UNC `\\…`, up to the first
 * character that ends a shell word.
 *
 * Over-matching is inert by construction: every candidate is handed to the caller's collapser and
 * replaced by whatever it returns, so a candidate that is not a home path comes back unchanged.
 */
const ABSOLUTE_PATH_CANDIDATE_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\|\/)[^\s"'`;|&<>()]+/g;
/** What may precede an absolute path: nothing, whitespace, a quote, or an argument separator. */
const ABSOLUTE_PATH_START_BOUNDARY_PATTERN = /[\s"'`=(,[{;|&<>]/;
/**
 * A long opaque run — the shape of an inline base64 payload or an API key this build has no named
 * pattern for.
 *
 * Kept HERE rather than in the shared credential scrubber on purpose: it is a policy, not a
 * credential vocabulary. On a 120-character cosmetic label over-redaction costs nothing, while in a
 * bug report the same rule would blank sha256 digests and destroy diagnostic value. The credential
 * shapes themselves stay single-owner in `redactBugReportSensitiveText`.
 */
const HIGH_ENTROPY_RUN_PATTERN = /[A-Za-z0-9+/=_-]{41,}/g;
function collapseWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function collapseAbsolutePaths(value, collapse) {
    return value.replace(ABSOLUTE_PATH_CANDIDATE_PATTERN, (match, offset, whole) => {
        const previous = offset > 0 ? whole.charAt(offset - 1) : '';
        if (previous !== '' && !ABSOLUTE_PATH_START_BOUNDARY_PATTERN.test(previous))
            return match;
        const collapsed = collapse(match);
        return typeof collapsed === 'string' && collapsed.length > 0 ? collapsed : match;
    });
}
function isOpaquePayloadRun(run) {
    // `+` and `=` are standard-base64 characters that a path run does not carry, so they veto BOTH
    // exemptions below. `/` is a base64 character too, which is why the path exemption cannot rest
    // on slashes alone: doing so switched the rule off exactly where it mattered most, since the
    // longer a payload is the more likely it contains two of them, and a padded 44-character key
    // passed through verbatim.
    const carriesBase64OnlyCharacters = /[+=]/.test(run);
    // Two or more separators reads as a path, not a payload — and a path has already been through
    // the collapser above, so blanking it here would undo the one thing that keeps a label useful.
    if (!carriesBase64OnlyCharacters && run.split('/').length - 1 >= 2)
        return false;
    // No digit and no base64 padding/plus: a long hyphenated word or branch name, not a secret.
    if (!/\d/.test(run) && !carriesBase64OnlyCharacters)
        return false;
    return true;
}
function stripHighEntropyRuns(value) {
    return value.replace(HIGH_ENTROPY_RUN_PATTERN, (match) => {
        // A run that begins at the `//` of a URL inherits those slashes and takes the path exemption,
        // which made ANY credential placed immediately after `://` exempt at any length — the
        // token-as-URL-username shape GitHub documents for fine-grained PATs. The slashes belong to the
        // scheme, not to the payload, so they are set aside before the run is judged and put back after.
        const leadingSlashes = /^\/+/.exec(match)?.[0] ?? '';
        const payload = match.slice(leadingSlashes.length);
        if (payload.length < 41)
            return match;
        return isOpaquePayloadRun(payload) ? `${leadingSlashes}${HIGH_ENTROPY_REDACTION}` : match;
    });
}
function truncateLabel(value) {
    if (value.length <= BACKGROUND_TASK_LABEL_MAX)
        return value;
    let cut = BACKGROUND_TASK_LABEL_MAX - BACKGROUND_TASK_LABEL_TRUNCATION_SUFFIX.length;
    // Stepping back off a high surrogate: the label is persisted, encrypted and synced, and a lone
    // surrogate is an ill-formed string that fails somewhere else entirely.
    const lastCode = value.charCodeAt(cut - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff)
        cut -= 1;
    return `${value.slice(0, cut).trimEnd()}${BACKGROUND_TASK_LABEL_TRUNCATION_SUFFIX}`;
}
/**
 * Returns the label to persist, or `''` when there is no command to describe — in which case the
 * record omits `label` rather than carrying a placeholder.
 *
 * **The order is the contract.** Secrets are removed BEFORE the label is cut to length: truncating
 * first would leave the head of a straddling credential in the persisted record, which is a leak
 * that looks like a redaction.
 */
export function redactBackgroundCommand(params) {
    const normalized = collapseWhitespace(String(params.command ?? ''));
    if (normalized.length === 0)
        return '';
    const withCollapsedPaths = collapseAbsolutePaths(normalized, params.collapseAbsolutePath);
    const withoutCredentials = redactBugReportSensitiveText(withCollapsedPaths);
    const withoutOpaqueRuns = stripHighEntropyRuns(withoutCredentials);
    return truncateLabel(collapseWhitespace(withoutOpaqueRuns));
}
//# sourceMappingURL=backgroundTaskRedaction.js.map