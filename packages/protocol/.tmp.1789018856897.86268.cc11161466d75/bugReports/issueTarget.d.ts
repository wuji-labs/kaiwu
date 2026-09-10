export declare function normalizeBugReportIssueSlug(input: string | null | undefined): string | null;
export declare function normalizeBugReportIssueTarget(input: {
    owner: string | null | undefined;
    repo: string | null | undefined;
}): {
    owner: string;
    repo: string;
} | null;
export declare function resolveBugReportIssueTargetWithDefaults(input: {
    owner: string | null | undefined;
    repo: string | null | undefined;
    defaultOwner?: string;
    defaultRepo?: string;
}): {
    owner: string;
    repo: string;
};
//# sourceMappingURL=issueTarget.d.ts.map