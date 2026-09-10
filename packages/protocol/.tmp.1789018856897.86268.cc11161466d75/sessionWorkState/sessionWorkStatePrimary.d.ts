import type { SessionWorkStateWriteItemV1 } from './sessionWorkStateV1.js';
export type ResolveSessionWorkStatePrimaryOptions = Readonly<{
    /**
     * The previously-resolved primary. Preserved when it is still a present
     * task/todo so the badge does not jitter between equal-priority work items.
     */
    currentPrimaryItemId?: string | null;
    /**
     * Item ids written by the CURRENT publish (the merge passes `nextOwned`'s ids).
     * Within a single priority bucket the most-recently-published item wins the tie,
     * so e.g. the goal you JUST set becomes primary over a stale pre-existing goal
     * of the same status. This is one general recency rule — it never lets a lower
     * priority beat a higher one (an active task still outranks a just-set goal).
     */
    preferItemIds?: readonly string[];
}>;
/**
 * Resolve the canonical `primaryItemId` for a (merged) set of work-state items.
 */
export declare function resolveSessionWorkStatePrimaryItemId(items: readonly SessionWorkStateWriteItemV1[], currentPrimaryItemId?: string | null, options?: ResolveSessionWorkStatePrimaryOptions): string | null;
//# sourceMappingURL=sessionWorkStatePrimary.d.ts.map