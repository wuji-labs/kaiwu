import { z } from 'zod';
/**
 * The session-metadata key the unified agent-activity headline is published under.
 *
 * A CROSS-REPO WIRE LITERAL: remote-dev and `../dev` both write and read this exact string, so it
 * is protocol-owned rather than restated at each producer and consumer, and it is pinned by a
 * hand-written literal in `agentActivityHeadlineMetadataKey.test.ts`. It is published ALONGSIDE
 * `sessionWorkflowActivityHeadlineV1`, which keeps its name, its shape and its own parity lock —
 * this program is the expand step only (PLAN §5.2); removing the older key is out of scope.
 */
export declare const SESSION_AGENT_ACTIVITY_HEADLINE_METADATA_KEY = "sessionAgentActivityHeadlineV1";
export declare const SessionAgentActivityHeadlineTruncationV1Schema: any;
export type SessionAgentActivityHeadlineTruncationV1 = z.infer<typeof SessionAgentActivityHeadlineTruncationV1Schema>;
/**
 * The unified agent-activity headline: a count-only live pointer published into session metadata.
 *
 * Shaped deliberately like `SessionWorkflowActivityHeadlineV1` — same envelope, same active/recent
 * split, same derived-primary hint — because it is DERIVED from that headline rather than parallel
 * to it (PLAN §3.1), and the two are ported to `../dev` together. What it adds is the ability to
 * describe kinds of work beyond a workflow run; what it deliberately does not add is detail.
 *
 * `activeEntries` is never bounded: a roster that is quietly incomplete is the failure R-3 exists to
 * prevent. Only `recentEntries` is bounded, and `truncated` says so out loud.
 */
export declare const SessionAgentActivityHeadlineV1Schema: any;
export type SessionAgentActivityHeadlineV1 = z.infer<typeof SessionAgentActivityHeadlineV1Schema>;
/**
 * Read a headline written by any build of either repo, tolerating entries this build cannot parse.
 *
 * The tolerance is the point, and it is not defensive habit: `AgentActivityKindV1` grows a member
 * every time a kind gains a proven writer (PLAN §5.1 item 11 — `background_task` is already
 * scheduled), and statuses can follow. With a whole-array parse, the first entry from a newer
 * producer would take the ENTIRE roster down to `null` on every client that predates it, turning a
 * forward-compatible addition into a regression for everyone else. Dropping the rows this build
 * genuinely cannot render, and keeping the ones it can, is the degrade PLAN §5.2 requires.
 *
 * Dropped entries are NOT folded into `truncated`: that field means the producer bounded terminal
 * history, and reusing it for a parse failure would report a producer decision that never happened.
 *
 * Returns `null` — never throws — for anything that is not a v1 headline.
 */
export declare function parseSessionAgentActivityHeadlineV1(value: unknown): SessionAgentActivityHeadlineV1 | null;
/**
 * The one reader of the agent-activity headline out of a session-metadata object.
 *
 * Every consumer — CLI, UI, `../dev` — goes through this rather than reaching for the key itself,
 * so the cross-repo literal has exactly one spelling and the parity lock actually locks something.
 */
export declare function readSessionAgentActivityHeadlineFromMetadata(metadata: unknown): SessionAgentActivityHeadlineV1 | null;
//# sourceMappingURL=agentActivityHeadlineV1.d.ts.map