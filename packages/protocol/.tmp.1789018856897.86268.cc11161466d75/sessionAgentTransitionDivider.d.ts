import { z } from 'zod';
/**
 * Transition divider contract — the ONLY transition history artifact.
 *
 * The divider is deliberately NOT a new `AgentEventSchema` variant. That union is
 * closed at the discriminator, so a released older reader would fail to parse an
 * unknown `type` and drop the row. Instead the divider rides the already-shipped
 * `type:'message'` passthrough arm as a strict nested sidecar:
 *
 *   { type: 'message', message: '<prose>', sessionAgentTransitionV1: { v, fromAgentId, toAgentId, ...bounds } }
 *
 * An old reader parses it as an ordinary informational message and renders the
 * prose; the sidecar survives its `.passthrough()` untouched. A new reader
 * recognizes the sidecar through {@link readSessionAgentTransitionDividerV1}.
 *
 * This module intentionally imports nothing but `zod` so the transcript record
 * schema, the attention resolvers, and the transition coordinator can all depend
 * on one owner without an import cycle.
 */
/** Sidecar key carried on the passthrough `type:'message'` agent-event arm. */
export declare const SESSION_AGENT_TRANSITION_DIVIDER_SIDECAR_KEY = "sessionAgentTransitionV1";
/**
 * Prose stored on the divider row. It exists only so a reader that does not
 * understand the sidecar still renders something truthful. New readers render
 * localized copy from the sidecar instead, so this string is not a UI oracle.
 */
export declare const SESSION_AGENT_TRANSITION_DIVIDER_MESSAGE = "Continued with another Agent.";
/**
 * Reserved local-ID namespace for the divider. Every generic client-facing
 * message ingress MUST reject a localId in this namespace; only the owner-only
 * transition service may pass one to the canonical `createSessionMessage` owner.
 */
export declare const SESSION_AGENT_TRANSITION_DIVIDER_LOCAL_ID_PREFIX = "agent-transition:";
export declare const SessionAgentTransitionDividerV1Schema: any;
export type SessionAgentTransitionDividerV1 = z.infer<typeof SessionAgentTransitionDividerV1Schema>;
/**
 * True only when two dividers describe the exact same handoff boundary.
 *
 * The replay bounds are not decoration: together they say exactly which slice
 * reached the target. Treating an equal Agent pair with different bounds as a
 * retry would admit or activate against somebody else's boundary.
 */
export declare function isSameSessionAgentTransitionDividerV1(left: Readonly<SessionAgentTransitionDividerV1>, right: Readonly<SessionAgentTransitionDividerV1>): boolean;
/**
 * Matches only the Agent pair known to a post-cutover reconciliation request.
 *
 * A retry that reaches an already-target Session has no surviving candidate
 * bounds to compare — the durable request carries its localId and Agent pair,
 * while the original bounded pass is gone. That recovery check must therefore
 * not impersonate exact-boundary equality. Callers that still hold the
 * candidate divider (the cutover owner and E2EE verification gate) use
 * {@link isSameSessionAgentTransitionDividerV1} instead.
 */
export declare function matchesSessionAgentTransitionDividerAgentsV1(divider: Readonly<SessionAgentTransitionDividerV1>, expected: Readonly<Pick<SessionAgentTransitionDividerV1, 'fromAgentId' | 'toAgentId'>>): boolean;
/**
 * Deterministic divider identity: `agent-transition:{submittedLocalId}`. The
 * submitted user-message localId is the single correlation key for the whole
 * transition, so the divider is exactly-once without any receipt or marker.
 */
export declare function buildSessionAgentTransitionDividerLocalId(submittedLocalId: string): string;
/** True when a localId falls in the reserved divider namespace. */
export declare function isSessionAgentTransitionDividerLocalId(localId: unknown): boolean;
/**
 * The single canonical "is this row a transition divider?" reader.
 *
 * It requires BOTH halves of the divider's identity:
 *
 *   - `localId` — the row's OUTER local id, which must be in the reserved
 *     namespace. Every generic message ingress refuses that prefix, so only the
 *     owner-only cutover service can produce a row there. This is the half that
 *     makes the answer trustworthy.
 *   - `event` — the agent-event payload (the `data` of a `type:'event'`
 *     transcript record), which must carry a strictly valid sidecar.
 *
 * The sidecar alone is NOT proof and must never be read as one: its key name is
 * writable by anyone who can post an agent event to the Session, so trusting it
 * on an ordinary row would let an authorized writer silence their own message
 * and manufacture an attribution boundary the transition never made. Attention
 * resolvers, the separator renderer, historical attribution, and the bounded
 * context pass all use THIS function — none of them re-implement either check.
 */
export declare function readSessionAgentTransitionDividerV1(row: Readonly<{
    localId: unknown;
    event: unknown;
}>): SessionAgentTransitionDividerV1 | null;
/**
 * The stored-record shape a row MUST have before any process calls it a
 * transition divider.
 *
 * {@link readSessionAgentTransitionDividerV1} answers for the reserved localId
 * and the agent-event PAYLOAD; on its own it says nothing about the record
 * WRAPPER carrying that payload. The divider is always written as a
 * `role:'agent'` / `content.type:'event'` record, so a user-role (or non-event)
 * row planted at the reserved localId with a matching sidecar must never be read
 * as one. The server's cutover owner and the daemon's
 * divider-evidence reader both answer that question — about the same rows, in
 * different processes — so they answer it HERE rather than each re-deriving the
 * wrapper checks.
 */
export declare function readSessionAgentTransitionDividerFromStoredRecordV1(row: Readonly<{
    localId: unknown;
    record: unknown;
}>): SessionAgentTransitionDividerV1 | null;
//# sourceMappingURL=sessionAgentTransitionDivider.d.ts.map