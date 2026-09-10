import type { SessionWorkStateItemV1, SessionWorkStateTruncationV1 } from './sessionWorkStateV1.js';
export declare function boundSessionWorkStateItemsV1(params: Readonly<{
    items: readonly SessionWorkStateItemV1[];
    maxItems?: number | null;
}>): Readonly<{
    items: SessionWorkStateItemV1[];
    truncated?: SessionWorkStateTruncationV1;
}>;
//# sourceMappingURL=sessionWorkStateBounds.d.ts.map