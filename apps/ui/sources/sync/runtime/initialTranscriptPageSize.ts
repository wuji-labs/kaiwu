/**
 * How many messages the first page of a transcript fetches when nothing is held locally (first
 * open, or a large-gap tail reset). Older history then arrives through the existing older pager on
 * scroll-up, so the first page only has to fill one screen.
 *
 * The production relay is a ~6 Mbps shared link on which one 150-message page measured 534 KB raw
 * / 420 KB gzipped and 3.3 s to download; the configured 150 is the right size for a paging walk the
 * reader asked for, not for the first paint.
 *
 * Native derivation: the smallest transcript row is ~40 dp tall, and a row often carries two server
 * messages (a tool call and its result render as one row), so one viewport needs at most
 * `ceil(height / 40) * 2` messages — 44 on an 852 dp phone, 70 on a 1366 dp tablet. If a screen of
 * unusually small rows still underfills, the initial-fill loop loads older pages as before.
 *
 * Web keeps its measured 12-message first paint (#305), whose deferred backfill owns reachability.
 */
const WEB_INITIAL_SESSION_MESSAGES_PAGE_SIZE = 12;
const MIN_TRANSCRIPT_ROW_HEIGHT_DP = 40;
const MAX_MESSAGES_PER_TRANSCRIPT_ROW = 2;
const MIN_INITIAL_SESSION_MESSAGES_PAGE_SIZE = 12;

export function resolveInitialSessionMessagesPageSize(params: Readonly<{
    platformOS: string;
    viewportHeightDp: number;
    configuredPageSize: number;
}>): number {
    const configured = Math.max(1, Math.trunc(params.configuredPageSize));
    if (params.platformOS === 'web') return Math.min(configured, WEB_INITIAL_SESSION_MESSAGES_PAGE_SIZE);
    const height = Number.isFinite(params.viewportHeightDp) ? Math.max(0, params.viewportHeightDp) : 0;
    const screenful = Math.ceil(height / MIN_TRANSCRIPT_ROW_HEIGHT_DP) * MAX_MESSAGES_PER_TRANSCRIPT_ROW;
    return Math.min(configured, Math.max(MIN_INITIAL_SESSION_MESSAGES_PAGE_SIZE, screenful));
}
