import { BUG_REPORT_DEFAULT_ISSUE_OWNER, BUG_REPORT_DEFAULT_ISSUE_REPO } from './types.js';
const GITHUB_SLUG_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/;
export function normalizeBugReportIssueSlug(input) {
    const value = String(input ?? '').trim();
    if (!value)
        return null;
    if (!GITHUB_SLUG_PATTERN.test(value))
        return null;
    return value;
}
export function normalizeBugReportIssueTarget(input) {
    const owner = normalizeBugReportIssueSlug(input.owner);
    const repo = normalizeBugReportIssueSlug(input.repo);
    if (!owner || !repo)
        return null;
    return { owner, repo };
}
export function resolveBugReportIssueTargetWithDefaults(input) {
    const fallbackOwner = normalizeBugReportIssueSlug(input.defaultOwner ?? BUG_REPORT_DEFAULT_ISSUE_OWNER) ?? BUG_REPORT_DEFAULT_ISSUE_OWNER;
    const fallbackRepo = normalizeBugReportIssueSlug(input.defaultRepo ?? BUG_REPORT_DEFAULT_ISSUE_REPO) ?? BUG_REPORT_DEFAULT_ISSUE_REPO;
    const owner = normalizeBugReportIssueSlug(input.owner) ?? fallbackOwner;
    const repo = normalizeBugReportIssueSlug(input.repo) ?? fallbackRepo;
    return { owner, repo };
}
//# sourceMappingURL=issueTarget.js.map