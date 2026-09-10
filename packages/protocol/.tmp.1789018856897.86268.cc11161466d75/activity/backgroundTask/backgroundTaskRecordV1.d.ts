import { z } from 'zod';
/**
 * Longest label this record may persist.
 *
 * The bound is the redaction contract's, not a display preference: `redactBackgroundCommand`
 * truncates to exactly this many characters, so a label that exceeds it did not come through
 * redaction. Failing the parse is therefore the last gate before an unredacted command reaches
 * persistence and every client.
 */
export declare const BACKGROUND_TASK_LABEL_MAX = 120;
/**
 * Longest provider summary this record may persist.
 *
 * `task_notification.summary` is provider prose of unbounded length (OBSERVED: the SDK types it as
 * a plain `string`), and this record is synced to every client on every read, so it is bounded here
 * rather than at each renderer.
 */
export declare const BACKGROUND_TASK_SUMMARY_MAX = 2000;
/**
 * What a background task IS, as one classified bucket.
 *
 * Not the provider's `task_type`. The raw type drifts — t3code's production note records an
 * allowlist that silently dropped real subagents when `local_agent` appeared — so the CLI classifies
 * once at ingestion and persists the answer, and every renderer reads the answer instead of
 * re-deriving it from a string it does not own.
 *
 * Distinct from `AgentActivityKindV1`, which says what kind of ROW a piece of agent activity is.
 * This says which kind of headless work one background task is, and only ever describes tasks that
 * already failed the "is this an agent?" question.
 *
 * - `command` — a shell that outlives its turn (`local_bash`, `shell`).
 * - `monitoring` — a watch loop (`monitor`, `monitor_mcp`). Recognised now so that a provider that
 *   starts emitting these classifies them instead of dropping them; PLAN §4.9.2 ships no monitor
 *   row, action or schedule model, because no producer is verified.
 * - `unknown` — fully typed, admitted, but of a type this build does not recognise. PLAN §4.9.1
 *   step 5 degrades such a task to background rather than guessing that it is an agent.
 */
export declare const BACKGROUND_TASK_KINDS_V1: readonly ["command", "monitoring", "unknown"];
export declare const BackgroundTaskKindV1Schema: any;
export type BackgroundTaskKindV1 = z.infer<typeof BackgroundTaskKindV1Schema>;
/**
 * Durable outcome record for ONE Claude background task, persisted as a session system record
 * under namespace `activity`, kind `background_task.v1`.
 *
 * **Only attested fields.** Every field below is one this program has seen a provider payload
 * carry, and the record deliberately lacks the ones it has not:
 *
 * - **No `cwd`.** It appears in no observed Claude task payload (checked against the recorded
 *   fixtures in `apps/cli/src/backends/claude/workflows/__fixtures__/**` and the SDK's declared
 *   `SDKTaskStarted/Progress/Notification/Updated` message types). A detail view degrades to the
 *   progress line or the status alone.
 * - **No output.** `stdout`/`stderr` arrive on the originating `Bash` tool result, which is where
 *   the transcript already renders them. A second copy here would be a second authority.
 * - **No retention promise.** There is no TTL mechanism, so no field or copy may imply one.
 *
 * Liveness is NOT stored here. The in-memory provider ledger owns "is this task still running" and
 * is rebuildable; this record owns the durable outcome (PLAN §4.9).
 *
 * `.strip()` rather than the `.passthrough()` its `workflow_run.v1` sibling uses, and deliberately:
 * this record is the one place a redaction bug could persist a raw command, so the schema is a
 * chokepoint that drops anything the contract does not name instead of forwarding it.
 */
export declare const SessionBackgroundTaskRecordV1Schema: any;
export type SessionBackgroundTaskRecordV1 = z.infer<typeof SessionBackgroundTaskRecordV1Schema>;
//# sourceMappingURL=backgroundTaskRecordV1.d.ts.map