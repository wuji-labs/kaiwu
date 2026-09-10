import { type SessionWorkStateV1, type SessionWorkStateWriteSnapshotV1 } from './sessionWorkStateV1.js';
export declare function mergeSessionWorkStateV1(params: Readonly<{
    existing: unknown;
    nextOwned: SessionWorkStateV1;
    ownedItemIds?: readonly string[];
    ownedItemIdPrefixes?: readonly string[];
    ownedSourceFamilies?: readonly string[];
}>): SessionWorkStateWriteSnapshotV1;
export declare function mergeSessionWorkStateMetadataV1(params: Readonly<{
    metadata: unknown;
    nextOwned: SessionWorkStateV1;
    ownedItemIds?: readonly string[];
    ownedItemIdPrefixes?: readonly string[];
    ownedSourceFamilies?: readonly string[];
}>): Record<string, unknown> & Readonly<{
    sessionWorkStateV1: SessionWorkStateWriteSnapshotV1;
}>;
//# sourceMappingURL=sessionWorkStateMerge.d.ts.map