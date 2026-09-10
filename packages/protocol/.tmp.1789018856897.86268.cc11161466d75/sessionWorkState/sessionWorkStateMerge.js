import { resolveSessionWorkStatePrimaryItemId } from './sessionWorkStatePrimary.js';
import { SessionWorkStateV1Schema, } from './sessionWorkStateV1.js';
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function readItemId(item) {
    const record = asRecord(item);
    const id = record && typeof record.id === 'string' ? record.id.trim() : '';
    return id || null;
}
function isOwnedItemId(id, ownedIds, ownedPrefixes) {
    return ownedIds.has(id) || ownedPrefixes.some((prefix) => id.startsWith(prefix));
}
function normalizeOwnedSourceFamilies(sourceFamilies) {
    return (sourceFamilies ?? []).flatMap((sourceFamily) => {
        const normalized = sourceFamily.trim();
        return normalized ? [`${normalized}:`] : [];
    });
}
function readExistingSnapshot(value) {
    const record = asRecord(value);
    if (!record)
        return null;
    if (record.v !== 1 || typeof record.backendId !== 'string' || typeof record.updatedAt !== 'number')
        return null;
    return {
        ...record,
        v: 1,
        backendId: record.backendId,
        updatedAt: record.updatedAt,
        items: Array.isArray(record.items) ? record.items : [],
    };
}
function readPrimaryItemId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return id.length > 0 ? id : null;
}
export function mergeSessionWorkStateV1(params) {
    const nextOwned = SessionWorkStateV1Schema.parse(params.nextOwned);
    const existing = readExistingSnapshot(params.existing);
    if (!existing) {
        // Even the first publish must not force a source-local primary; resolve it
        // canonically so a goal-only vs task-only snapshot agree with the merged rule.
        return {
            ...nextOwned,
            primaryItemId: resolveSessionWorkStatePrimaryItemId(nextOwned.items, readPrimaryItemId(nextOwned.primaryItemId)),
        };
    }
    const nextOwnedIds = new Set(nextOwned.items.map((item) => item.id));
    const ownedIds = new Set([...(params.ownedItemIds ?? []), ...nextOwnedIds]);
    const ownedPrefixes = [
        ...(params.ownedItemIdPrefixes ?? []),
        ...normalizeOwnedSourceFamilies(params.ownedSourceFamilies),
    ];
    const preservedItems = existing.items.filter((item) => {
        const id = readItemId(item);
        return !id || !isOwnedItemId(id, ownedIds, ownedPrefixes);
    }).flatMap((item) => asRecord(item) ? [item] : []);
    const mergedItems = [...preservedItems, ...nextOwned.items];
    // MED-2: resolve the primary ONCE over the MERGED item set using ONE canonical
    // rule, instead of letting whichever source published last (`nextOwned`) force
    // its own `primaryItemId`. The previous snapshot's primary is passed for
    // stability (keep an active task/todo primary across updates), and the items the
    // current publish wrote are passed as a recency tie-break (the goal you just set
    // beats a stale goal of the same status) — without ever overriding priority.
    return {
        ...existing,
        ...nextOwned,
        items: mergedItems,
        primaryItemId: resolveSessionWorkStatePrimaryItemId(mergedItems, readPrimaryItemId(existing.primaryItemId), { preferItemIds: nextOwned.items.map((item) => item.id) }),
    };
}
export function mergeSessionWorkStateMetadataV1(params) {
    const metadata = asRecord(params.metadata) ?? {};
    const nextWorkState = mergeSessionWorkStateV1({
        existing: metadata.sessionWorkStateV1,
        nextOwned: params.nextOwned,
        ...(params.ownedItemIds ? { ownedItemIds: params.ownedItemIds } : {}),
        ...(params.ownedItemIdPrefixes ? { ownedItemIdPrefixes: params.ownedItemIdPrefixes } : {}),
        ...(params.ownedSourceFamilies ? { ownedSourceFamilies: params.ownedSourceFamilies } : {}),
    });
    return {
        ...metadata,
        sessionWorkStateV1: nextWorkState,
    };
}
//# sourceMappingURL=sessionWorkStateMerge.js.map