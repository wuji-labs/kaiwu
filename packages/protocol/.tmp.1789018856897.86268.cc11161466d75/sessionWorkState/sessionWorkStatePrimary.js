function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function readId(item) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    return id.length > 0 ? id : null;
}
function isKind(item, kind) {
    return item.kind === kind;
}
function isTaskOrTodo(item) {
    return isKind(item, 'task') || isKind(item, 'todo');
}
function isStatus(item, status) {
    return item.status === status;
}
function toIdSet(ids) {
    const set = new Set();
    for (const id of ids ?? []) {
        const normalized = typeof id === 'string' ? id.trim() : '';
        if (normalized)
            set.add(normalized);
    }
    return set;
}
/**
 * The canonical primary-priority ladder, ordered best-first. Used BOTH to compute the winning rank
 * for the stability tie-break and to select the final primary, so there is a single source of truth
 * for "what is primary" (no similar-but-different predicate sets). Items matching no rung fall into
 * the terminal/unknown bucket (`complete`/`cancelled`/`unknown`) and rank below every active rung,
 * so they only become primary when nothing else can.
 */
const PRIMARY_PRIORITY_LADDER = [
    (item) => isKind(item, 'task') && isStatus(item, 'active'),
    (item) => isKind(item, 'todo') && isStatus(item, 'active'),
    (item) => isKind(item, 'goal') && isStatus(item, 'active'),
    (item) => isStatus(item, 'blocked'),
    (item) => isStatus(item, 'paused'),
    (item) => isStatus(item, 'pending'),
];
/** Lower is higher priority. The terminal/unknown bucket sits just past the last rung. */
function primaryRank(item) {
    for (let index = 0; index < PRIMARY_PRIORITY_LADDER.length; index += 1) {
        if (PRIMARY_PRIORITY_LADDER[index](item))
            return index;
    }
    return PRIMARY_PRIORITY_LADDER.length;
}
/**
 * Resolve the canonical `primaryItemId` for a (merged) set of work-state items.
 */
export function resolveSessionWorkStatePrimaryItemId(items, currentPrimaryItemId, options) {
    const records = items.flatMap((item) => {
        const record = asRecord(item);
        return record && readId(record) ? [record] : [];
    });
    if (records.length === 0)
        return null;
    const current = (typeof currentPrimaryItemId === 'string' ? currentPrimaryItemId.trim() : '') || null;
    const preferredIds = toIdSet(options?.preferItemIds);
    // The best (lowest) rank present. The stability tie-break preserves the current primary only when
    // it is STILL tied for this rank, so a row that dropped in rank (e.g. completed/cancelled) yields.
    const winningRank = records.reduce((best, item) => Math.min(best, primaryRank(item)), PRIMARY_PRIORITY_LADDER.length);
    // Stability: keep the current primary only when it is still a present task/todo AND still tied for
    // the winning rank (a same-priority tie-break — never a pre-priority pin).
    if (current) {
        const currentRecord = records.find((item) => readId(item) === current);
        if (currentRecord && isTaskOrTodo(currentRecord) && primaryRank(currentRecord) === winningRank) {
            return current;
        }
    }
    // Within a priority bucket, prefer a just-published item over a stale one
    // (recency tie-break), otherwise fall back to document order.
    const pick = (predicate) => {
        const matches = records.filter(predicate);
        if (matches.length === 0)
            return null;
        const preferred = matches.find((item) => {
            const id = readId(item);
            return id ? preferredIds.has(id) : false;
        });
        return readId(preferred ?? matches[0] ?? {}) ?? null;
    };
    for (const predicate of PRIMARY_PRIORITY_LADDER) {
        const picked = pick(predicate);
        if (picked)
            return picked;
    }
    return readId(records[0] ?? {}) ?? null;
}
//# sourceMappingURL=sessionWorkStatePrimary.js.map