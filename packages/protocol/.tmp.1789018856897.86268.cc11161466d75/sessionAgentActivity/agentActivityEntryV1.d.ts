import { z } from 'zod';
import { type AgentActivityStatusV1 } from './agentActivityStatusV1.js';
/**
 * Longest title a headline entry may carry.
 *
 * The headline is published into session metadata, which is encrypted, synced and read on every
 * cold open, so its size is a product cost paid by every client. A row renders one tail-truncated
 * line, and the untruncated title lives in the durable record the entry points at, so a bound this
 * generous is invisible in the UI and keeps a full roster in the low kilobytes. The workflow
 * headline's 4000-character bound is inherited from its snapshot schema and is not a precedent for
 * a per-entry roster.
 */
export declare const SESSION_AGENT_ACTIVITY_ENTRY_TITLE_MAX = 200;
/**
 * One unit of agent work, as the compact headline describes it.
 *
 * **A pointer, not a record.** Identity, kind, title, status, timing and the ids needed to find the
 * real thing — and nothing else. No transcript, no preview, no summary, no payload, no counts
 * copied off a child. Detail already lives somewhere durable and indexed (a sidechain is queryable
 * by `sidechainId`; a workflow run has its `activity/workflow_run.v1` record), and a second copy in
 * session metadata would be a second authority that can disagree with the first.
 *
 * Two fields carry hard-won rules:
 *
 * - `startedAt` is OPTIONAL and must never be synthesised. Defect D-8 shipped exactly that mistake
 *   one layer up (`startedAtMs ?? updatedAtMs ?? finishedAtMs ?? 0`), so a finished 16-second run
 *   reported `0:00`. Absent evidence of a start, the field is absent and the surface shows nothing.
 * - `updatedAt` is the instant of the most recent EVIDENCE about this entry — not the instant the
 *   producer last rebuilt it, and specifically not a launch timestamp that never advances. It feeds
 *   terminal-history ordering here and the quiet/stale presentation downstream, both of which lie
 *   if it stands still while the work does not.
 */
export declare const SessionAgentActivityEntryV1Schema: any;
export type SessionAgentActivityEntryV1 = z.infer<typeof SessionAgentActivityEntryV1Schema>;
/**
 * Narrow an entry to the headline field set.
 *
 * The producer-side half of the "headline never holds detail" invariant: structural typing lets a
 * caller pass a richer object, and this is the chokepoint that stops its extra fields reaching
 * session metadata regardless. It also clamps the title, so a producer cannot emit an entry that
 * its own schema would reject and that a reader would then silently drop.
 */
export declare function projectAgentActivityEntry(entry: SessionAgentActivityEntryV1): SessionAgentActivityEntryV1;
/**
 * Rank among ACTIVE entries; lower sorts first.
 *
 * `waiting` leads because it is the one status a person can clear right now — it is the only status
 * in the vocabulary that escalates. Then dependency-blocked, then live work, then work that has been
 * admitted but is not producing yet, then ambiguous. Terminal statuses sort last so that a caller
 * who hands this comparator a mixed array cannot bury a live entry under finished ones; they never
 * reach the active list through the builder.
 */
export declare function resolveAgentActivityEntryActivePriority(entry: Readonly<{
    status: AgentActivityStatusV1;
}>): number;
//# sourceMappingURL=agentActivityEntryV1.d.ts.map