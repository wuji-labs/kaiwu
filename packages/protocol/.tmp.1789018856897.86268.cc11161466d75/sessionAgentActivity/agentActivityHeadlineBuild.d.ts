import { type SessionAgentActivityEntryV1 } from './agentActivityEntryV1.js';
import type { SessionAgentActivityHeadlineTruncationV1, SessionAgentActivityHeadlineV1 } from './agentActivityHeadlineV1.js';
/**
 * Default terminal-history bound for the compact metadata headline.
 *
 * Only `recentEntries` is bounded; `activeEntries` is never capped, for the reason stated in
 * `../sessionActivityHeadlineOrdering.ts`. The value matches the roster pane's own in-pane finished
 * cap (24) so the transport is never the thing that starves the surface: a pane that offers to show
 * 24 finished rows can actually be given 24. Producers may lower it; nothing may cap the active
 * side. Terminal detail stays durable in the records the entries point at.
 */
export declare const SESSION_AGENT_ACTIVITY_RECENT_ENTRIES_LIMIT = 24;
/** Deterministic active ordering, so every client agrees on the sequence and on `primaryEntryId`. */
export declare function sortActiveAgentActivityEntries(entries: readonly SessionAgentActivityEntryV1[]): SessionAgentActivityEntryV1[];
/** Bound only terminal history; never bound live work. */
export declare function boundRecentAgentActivityEntries(terminalEntries: readonly SessionAgentActivityEntryV1[], limit?: number): {
    recentEntries: SessionAgentActivityEntryV1[];
    truncated?: SessionAgentActivityHeadlineTruncationV1;
};
/**
 * `primaryEntryId` is a derived hint, not a second source of truth: `null` when nothing is live,
 * otherwise the first entry after deterministic active ordering.
 */
export declare function resolvePrimaryAgentActivityEntryId(activeEntries: readonly SessionAgentActivityEntryV1[]): string | null;
export type BuildSessionAgentActivityHeadlineInput = Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    /** Every currently-known entry, live and terminal, in any order. */
    entries: readonly SessionAgentActivityEntryV1[];
    recentEntriesLimit?: number;
}>;
/**
 * Build the compact headline from a flat list of entries.
 *
 * The single shared builder for this key: the CLI publisher, any test fixture and `../dev` all go
 * through it, so ordering, bounding and the count-only projection cannot diverge between the
 * producer and whatever else assembles a headline.
 */
export declare function buildSessionAgentActivityHeadline(input: BuildSessionAgentActivityHeadlineInput): SessionAgentActivityHeadlineV1;
//# sourceMappingURL=agentActivityHeadlineBuild.d.ts.map