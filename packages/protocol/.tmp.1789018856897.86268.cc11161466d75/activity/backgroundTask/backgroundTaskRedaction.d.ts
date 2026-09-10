/**
 * Turn a raw background command into the label `activity/background_task.v1` may persist.
 *
 * **Why this exists at all.** t3code's liveness registry stores task ids and no command text, so it
 * has nothing to redact. We persist a label: it is written to a durable session system record and
 * synced to every client of the session. Persisting more obliges us to redact more — this is a
 * consequence of the durable-record design, not caution.
 *
 * **Scope.** The result is the activity record's label and nothing else. The `Bash` transcript card
 * is untouched and remains where the real command and its output live (PLAN §4.9).
 *
 * Call it at the CLI, before the record is built. The unredacted command is never persisted and
 * never crosses the wire.
 */
/**
 * Maps ONE absolute path to its display form.
 *
 * Required, not optional, and injected rather than implemented here. Home-directory handling has
 * canonical owners per layer (`sessionHandoffPathNormalization.ts#toHomeRelativePath` on the CLI,
 * `formatPathRelativeToHome.ts` in the UI) and the repo forbids hand-rolling a third; protocol also
 * has no `node:path` and no notion of a machine's home. So this module owns only the part nobody
 * else does — finding the absolute paths inside a command line — and delegates the mapping,
 * including the sibling-prefix rule (`/Users/alice` must not swallow `/Users/alice2`) that lives
 * with the owner. Making the parameter required means a caller cannot silently skip the collapse.
 */
export type BackgroundCommandPathCollapse = (absolutePath: string) => string;
export declare const BACKGROUND_TASK_LABEL_TRUNCATION_SUFFIX = "\u2026";
/**
 * Returns the label to persist, or `''` when there is no command to describe — in which case the
 * record omits `label` rather than carrying a placeholder.
 *
 * **The order is the contract.** Secrets are removed BEFORE the label is cut to length: truncating
 * first would leave the head of a straddling credential in the persisted record, which is a leak
 * that looks like a redaction.
 */
export declare function redactBackgroundCommand(params: Readonly<{
    command: string | null | undefined;
    collapseAbsolutePath: BackgroundCommandPathCollapse;
}>): string;
//# sourceMappingURL=backgroundTaskRedaction.d.ts.map