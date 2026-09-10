import type { SessionWorkStateItemKindV1 } from './sessionWorkStateV1.js';
export declare function buildVendorSessionWorkStateItemId(kind: SessionWorkStateItemKindV1, vendorRef: string): string;
export declare function buildDeterministicSessionWorkStateItemId(params: Readonly<{
    kind: SessionWorkStateItemKindV1;
    sourceFamily: string;
    stableParts: readonly unknown[];
}>): string;
//# sourceMappingURL=sessionWorkStateItemIds.d.ts.map