import { BUG_REPORT_DEFAULT_ISSUE_OWNER, BUG_REPORT_DEFAULT_ISSUE_REPO, BUG_REPORT_FALLBACK_BODY_TRUNCATION_SUFFIX, BUG_REPORT_FALLBACK_ISSUE_URL_MAX_LENGTH, } from './types.js';
import { resolveBugReportIssueTargetWithDefaults } from './issueTarget.js';
export function normalizeBugReportReproductionSteps(raw) {
    const inputLines = Array.isArray(raw)
        ? raw.flatMap((value) => String(value ?? '').split(/\r?\n/))
        : String(raw ?? '').split(/\r?\n/);
    const steps = inputLines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/^((\d+[.)])|[-*•])\s*/, '').trim())
        .filter((line) => line.length > 0);
    if (steps.length === 0)
        return [];
    return steps.slice(0, 20);
}
export function formatBugReportFallbackIssueBody(input) {
    const summary = input.summary.trim();
    const currentBehavior = input.currentBehavior?.trim();
    const expectedBehavior = input.expectedBehavior?.trim();
    const reproductionSteps = Array.isArray(input.reproductionSteps) ? input.reproductionSteps : [];
    const steps = reproductionSteps.length > 0
        ? reproductionSteps.map((step, index) => `${index + 1}. ${String(step ?? '').trim()}`).filter(Boolean).join('\n')
        : null;
    const platformLines = [
        input.environment.platform,
        input.environment.osVersion ? `- OS: ${input.environment.osVersion}` : null,
        input.environment.deviceModel ? `- Device: ${input.environment.deviceModel}` : null,
    ].filter((line) => Boolean(line));
    const platform = platformLines.join('\n');
    return [
        '### Summary',
        summary,
        '',
        currentBehavior ? '### What happened (current behavior)' : null,
        currentBehavior ?? null,
        currentBehavior ? '' : null,
        expectedBehavior ? '### Expected behavior' : null,
        expectedBehavior ?? null,
        expectedBehavior ? '' : null,
        steps ? '### Reproduction steps' : null,
        steps,
        steps ? '' : null,
        input.frequency ? '### Frequency' : null,
        input.frequency ?? null,
        input.frequency ? '' : null,
        input.severity ? '### Severity' : null,
        input.severity ?? null,
        input.severity ? '' : null,
        '### Kaiwu version',
        input.environment.appVersion,
        '',
        '### Platform',
        platform,
        '',
        input.environment.serverVersion ? '### Server version' : null,
        input.environment.serverVersion ?? null,
        input.environment.serverVersion ? '' : null,
        '### Deployment type',
        input.environment.deploymentType,
        '',
        '### Diagnostics',
        `- Diagnostics: ${input.diagnosticsIncluded ? 'included' : 'not included'}`,
        '- Diagnostics artifacts are unavailable from this fallback flow.',
        '',
        input.whatChangedRecently?.trim() ? '### What changed recently?' : null,
        input.whatChangedRecently?.trim() ? input.whatChangedRecently.trim() : null,
    ].filter((line) => Boolean(line)).join('\n');
}
export function buildBugReportFallbackIssueUrl(input) {
    const issueTarget = resolveBugReportIssueTargetWithDefaults({
        owner: input.owner,
        repo: input.repo,
        defaultOwner: BUG_REPORT_DEFAULT_ISSUE_OWNER,
        defaultRepo: BUG_REPORT_DEFAULT_ISSUE_REPO,
    });
    const issuePath = `https://github.com/${issueTarget.owner}/${issueTarget.repo}/issues/new`;
    const encode = (value) => encodeURIComponent(value).replace(/%20/g, '%20');
    const normalizedTitle = (input.title.trim() || 'Bug report').slice(0, 200);
    const buildUrlWithBody = (body) => {
        const query = [
            `title=${encode(normalizedTitle)}`,
            `body=${encode(body)}`,
        ].join('&');
        return `${issuePath}?${query}`;
    };
    const initialUrl = buildUrlWithBody(input.body);
    if (initialUrl.length <= BUG_REPORT_FALLBACK_ISSUE_URL_MAX_LENGTH)
        return initialUrl;
    const suffix = BUG_REPORT_FALLBACK_BODY_TRUNCATION_SUFFIX;
    const body = String(input.body ?? '');
    let low = 0;
    let high = body.length;
    let bestBody = suffix;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const nextBody = `${body.slice(0, mid)}${suffix}`;
        const nextUrl = buildUrlWithBody(nextBody);
        if (nextUrl.length <= BUG_REPORT_FALLBACK_ISSUE_URL_MAX_LENGTH) {
            bestBody = nextBody;
            low = mid + 1;
            continue;
        }
        high = mid - 1;
    }
    return buildUrlWithBody(bestBody);
}
//# sourceMappingURL=fallback.js.map