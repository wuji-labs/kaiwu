export type BugReportSimilarIssue = {
    owner: string;
    repo: string;
    number: number;
    url: string;
    title: string;
    state: 'open' | 'closed';
    updatedAt: string;
};
export declare function searchBugReportSimilarIssues(input: {
    providerUrl: string;
    owner: string;
    repo: string;
    query: string;
    limit?: number;
    state?: 'open' | 'closed' | 'all';
    timeoutMs?: number;
}): Promise<{
    issues: BugReportSimilarIssue[];
}>;
//# sourceMappingURL=similarIssues.d.ts.map