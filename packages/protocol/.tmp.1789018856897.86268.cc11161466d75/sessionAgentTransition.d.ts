import { z } from 'zod';
/**
 * Same-Session cross-Agent continuation — the frozen shared contract.
 *
 * Both trees implement THIS shape. The outer request/result is closed and
 * versioned; the nested user input reuses the already-canonical user-message
 * schema so no second message vocabulary exists.
 *
 * Machine RPC:      session.agentTransition
 * Inspection RPC:   session.continuation.inspect
 */
/**
 * The smallest portable intersection of the two trees' Session authoring field
 * catalogs. Every field below is present with the same shape in BOTH catalogs
 * (`agentId`, `modelId`, `acpSessionModeId`, `sessionConfigOptionOverrides`).
 *
 * Deliberately NOT used here:
 * - `kind:'builtInAgent'` target carriers with a hard-coded agent-id enum. The
 *   agent id is a free catalog identifier resolved and validated by each
 *   daemon's Agent catalog, so adding an Agent never requires a wire change.
 * - `AgentExecutionTargetV1` / `SessionModelSelectionV1`. Both are dev-only
 *   (zero occurrences in the predecessor tree) and cannot be a shared shape.
 *
 * Each daemon adapts this selection into its own internal target/model owners.
 * The adapters are fixed, so no downstream lane has to re-decide them:
 *
 * successor (`dev`)
 * - `agentId` -> Agent catalog resolution -> `AgentExecutionTargetV1`
 *   (`packages/protocol/src/agents/executionTargetV1.ts`).
 * - `modelId` + `providerConnectionId` -> `SessionModelSelectionV1`
 *   (`packages/protocol/src/providers/selection/v1.ts`).
 * - `acpSessionModeId` -> the existing agent/ACP session-mode owner.
 * - `sessionConfigOptionOverrides` -> carried through unchanged.
 *
 * predecessor (`remote-dev`, this tree)
 * - `agentId` -> validated against `CATALOG_AGENT_IDS`, then mapped onto the
 *   INTERNAL `{ kind: 'builtInAgent', agentId }` carrier in
 *   `apps/cli/src/rpc/handlers/spawnSessionOptionsContract.ts`. That carrier is
 *   an internal transport detail and never appears on this wire.
 * - `modelId` -> the flat `modelId` spawn field.
 * - `acpSessionModeId` -> the flat `agentModeId` spawn field.
 * - `sessionConfigOptionOverrides` -> the flat field of the same name.
 * - `providerConnectionId` -> NOT representable in this tree. Inspection reports it
 *   unavailable and the final mutation rejects with `target_unavailable`; it is
 *   never silently dropped.
 */
export declare const SessionAgentTransitionSelectionV1Schema: any;
export type SessionAgentTransitionSelectionV1 = z.infer<typeof SessionAgentTransitionSelectionV1Schema>;
/**
 * The exact user input carried by the transition. It is the canonical
 * user-message request with `localId` promoted from optional to REQUIRED: that
 * localId is the transition's dedupe identity, divider correlation key, and
 * draft compare-clear key, so it can never be absent.
 *
 * `safeExtend` (not `extend`) retains the canonical sanitizer and refinement.
 * The transition then closes its own mutation boundary; forward-compatible
 * message metadata remains inside the canonical opaque `meta` record.
 */
export declare const SessionAgentTransitionInputV1Schema: any;
export type SessionAgentTransitionInputV1 = z.infer<typeof SessionAgentTransitionInputV1Schema>;
export declare const SessionAgentTransitionRequestV1Schema: any;
export type SessionAgentTransitionRequestV1 = z.infer<typeof SessionAgentTransitionRequestV1Schema>;
/**
 * Definite rejections with the source PROVABLY untouched and still running.
 *
 * `source_stop_failed` belongs here and only here: it is the stop result that
 * PROVES the source is still running, which is the one stop outcome whose
 * `sourceEffect: 'none'` promise is truthful. An UNCONFIRMED stop
 * (`physical_stop_unconfirmed`, `stopped_projection_unconfirmed`) means the
 * source may already be gone, so it maps to `outcome_unknown` instead — never
 * to a rejection that claims an untouched source.
 */
export declare const SESSION_AGENT_TRANSITION_REJECTED_CODES_V1: readonly ["unsupported_operation", "forbidden", "same_target", "stale_selection", "target_unavailable", "source_not_idle", "source_stop_failed"];
/**
 * The source is CONFIRMED stopped and NOTHING was committed. This is a known
 * state, not an indeterminate one: the bounded context pass and the current-view
 * CAS both run after `requestSessionStop` succeeds and before any write.
 *
 * The Session remains owned by the source Agent. Presentation reconciles this
 * established effect with canonical Session and input-custody facts.
 */
export declare const SESSION_AGENT_TRANSITION_SOURCE_STOPPED_CODES_V1: readonly ["context_unavailable", "cutover_conflict"];
/**
 * The target current view IS committed: the source is stopped and the Session is
 * now the target Agent. Presentation reconciles this established effect with
 * canonical Session and input-custody facts.
 *
 * Missing, conflicting, or unreadable/unverifiable divider evidence produces
 * the one public `divider_unavailable` result. The storage-specific evidence
 * remains internal to the coordinator, but every such result knows the Session
 * is the target and must not degrade to `outcome_unknown`.
 *
 * `input_admission_failed` means admission did not happen; `input_rejected` is a
 * definite rejection by the canonical message owner. Both are only reachable
 * after cutover, so neither may ride `rejected`.
 */
export declare const SESSION_AGENT_TRANSITION_CURRENT_VIEW_COMMITTED_CODES_V1: readonly ["divider_unavailable", "target_start_failed", "input_admission_failed", "input_rejected"];
export declare const SessionAgentTransitionRejectedCodeV1Schema: any;
export type SessionAgentTransitionRejectedCodeV1 = z.infer<typeof SessionAgentTransitionRejectedCodeV1Schema>;
export declare const SessionAgentTransitionSourceStoppedCodeV1Schema: any;
export type SessionAgentTransitionSourceStoppedCodeV1 = z.infer<typeof SessionAgentTransitionSourceStoppedCodeV1Schema>;
export declare const SessionAgentTransitionCurrentViewCommittedCodeV1Schema: any;
export type SessionAgentTransitionCurrentViewCommittedCodeV1 = z.infer<typeof SessionAgentTransitionCurrentViewCommittedCodeV1Schema>;
/** Every code the `partially_applied` arm can carry, at either depth. */
export declare const SESSION_AGENT_TRANSITION_PARTIAL_CODES_V1: readonly ["context_unavailable", "cutover_conflict", "divider_unavailable", "target_start_failed", "input_admission_failed", "input_rejected"];
export declare const SessionAgentTransitionPartialCodeV1Schema: any;
export type SessionAgentTransitionPartialCodeV1 = z.infer<typeof SessionAgentTransitionPartialCodeV1Schema>;
/**
 * Every transition code. Each one is reachable from exactly one result arm, and
 * each arm names a distinct established effect.
 *
 * `reconciliation_required` is deliberately absent. Once `partially_applied`
 * carries both known partial depths, the only remaining case is a genuinely
 * indeterminate one — which is exactly the meaning of the bare `outcome_unknown`
 * arm. Keeping a code for it would let a daemon name a state it cannot actually
 * establish.
 */
export declare const SESSION_AGENT_TRANSITION_ERROR_CODES_V1: readonly ["unsupported_operation", "forbidden", "same_target", "stale_selection", "target_unavailable", "source_not_idle", "source_stop_failed", "context_unavailable", "cutover_conflict", "divider_unavailable", "target_start_failed", "input_admission_failed", "input_rejected"];
export declare const SessionAgentTransitionErrorCodeV1Schema: any;
export type SessionAgentTransitionErrorCodeV1 = z.infer<typeof SessionAgentTransitionErrorCodeV1Schema>;
/**
 * `accepted` means the target current view and divider committed AND the exact
 * localId received canonical message admission. It does not claim provider
 * acceptance.
 */
export declare const SessionAgentTransitionResultV1Schema: any;
export type SessionAgentTransitionResultV1 = z.infer<typeof SessionAgentTransitionResultV1Schema>;
export declare const SessionContinuationInspectionRequestV1Schema: any;
export type SessionContinuationInspectionRequestV1 = z.infer<typeof SessionContinuationInspectionRequestV1Schema>;
/**
 * `operation_unavailable` is the collapsed transport outcome: the machine RPC
 * returned METHOD_NOT_AVAILABLE, which a daemon that predates the operation and
 * an unreachable machine both produce. The daemon cannot distinguish them and
 * this contract does not pretend it can — see
 * {@link resolveSessionContinuationUnavailablePresentationV1}.
 */
export declare const SessionContinuationInspectionUnavailableReasonV1Schema: any;
export type SessionContinuationInspectionUnavailableReasonV1 = z.infer<typeof SessionContinuationInspectionUnavailableReasonV1Schema>;
export declare const SessionContinuationInspectionV1Schema: any;
export type SessionContinuationInspectionV1 = z.infer<typeof SessionContinuationInspectionV1Schema>;
/**
 * Machine reachability as the client already knows it, independent of this RPC.
 * Both trees expose `isMachineOnline(machine)` at
 * `apps/ui/sources/utils/sessions/machineUtils.ts`; `'unknown'` covers the case
 * where no machine record has hydrated yet.
 */
export type SessionContinuationMachinePresenceV1 = 'online' | 'offline' | 'unknown';
export declare const SessionContinuationUnavailablePresentationV1Schema: any;
export type SessionContinuationUnavailablePresentationV1 = z.infer<typeof SessionContinuationUnavailablePresentationV1Schema>;
/**
 * The transport collapses "old daemon" and "machine unreachable" into one
 * METHOD_NOT_AVAILABLE, so the RPC alone cannot tell them apart. The CLIENT can,
 * by combining the inspection reason with the machine-presence fact it already
 * holds. This is the one owner of that composition — UI surfaces consume it
 * rather than each re-deriving the three-way branch.
 */
export declare function resolveSessionContinuationUnavailablePresentationV1(params: Readonly<{
    reason: SessionContinuationInspectionUnavailableReasonV1;
    machinePresence: SessionContinuationMachinePresenceV1;
}>): SessionContinuationUnavailablePresentationV1;
/**
 * Rebuilds the activation brief one transition divider stands for.
 *
 * Nothing is stored to show: `replaySeedV1.seedText` is blanked the instant the
 * target Agent accepts it, and the metadata record keeps one seed per Session,
 * so a twice-switched Session has already lost the first. The divider's own
 * BOUNDS are the surviving inputs, and running the SAME bounded context pass
 * between them reproduces what the target was handed without persisting a
 * second copy of the conversation.
 *
 * It runs on the machine because that is where the pass runs: the retrieval
 * walks the fork chain, opens the Session's stored content and decodes every
 * provider dialect through the daemon's transcript decoder. A client that
 * re-derived the dialog from its own rendered transcript would be a SECOND
 * decision-maker about what the Agent was sent, free to disagree with the first
 * — which is the one thing a surface claiming to show the handoff must not be.
 *
 * Read-only and effect-free: it reserves nothing, writes nothing, and grants no
 * authority. A stale answer can only mislead a label.
 */
export declare const SessionAgentTransitionBriefPreviewRequestV1Schema: any;
export type SessionAgentTransitionBriefPreviewRequestV1 = z.infer<typeof SessionAgentTransitionBriefPreviewRequestV1Schema>;
/**
 * `operation_unavailable` is the collapsed transport outcome, exactly as in
 * {@link SessionContinuationInspectionUnavailableReasonV1Schema}: METHOD_NOT_AVAILABLE
 * is produced both by a daemon predating the operation and by an unreachable
 * machine, and the same client-side presentation owner splits them.
 *
 * `source_unreadable` is the daemon's own answer: the bounded retrieval failed
 * or the Session's content could not be opened, so what it holds is unknown.
 * That is NOT `empty`, and collapsing the two would show "nothing was carried
 * over" for a conversation that was.
 */
export declare const SessionAgentTransitionBriefPreviewUnavailableReasonV1Schema: any;
export type SessionAgentTransitionBriefPreviewUnavailableReasonV1 = z.infer<typeof SessionAgentTransitionBriefPreviewUnavailableReasonV1Schema>;
export declare const SessionAgentTransitionBriefPreviewV1Schema: any;
export type SessionAgentTransitionBriefPreviewV1 = z.infer<typeof SessionAgentTransitionBriefPreviewV1Schema>;
/**
 * The persisted draft intent. Selecting another Agent is effect-free; this value
 * only arms the next true submission.
 *
 * It carries no acknowledgment flag, timer, TTL, operation id, or progress
 * phase: the existing draft envelope owns timestamps, revisions, and cleanup.
 */
export declare const ComposerAgentContinuationIntentV1Schema: any;
export type ComposerAgentContinuationIntentV1 = z.infer<typeof ComposerAgentContinuationIntentV1Schema>;
//# sourceMappingURL=sessionAgentTransition.d.ts.map