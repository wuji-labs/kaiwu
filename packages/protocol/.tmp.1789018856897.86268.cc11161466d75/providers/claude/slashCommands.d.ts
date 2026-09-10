/**
 * Canonical Claude slash-command name normalization (plan G1).
 *
 * Claude surfaces its supported slash commands through the system/init
 * `slash_commands` list (also mirrored onto `metadata.slashCommands`). The SDK
 * and transcript shapes are inconsistent about the leading slash: some emit
 * `goal`, others `/goal`. Happy accepts both. Before this helper the CLI goal
 * source and the UI goal gate each did a raw `slashCommands.includes('goal')`,
 * which silently missed the `/goal` shape and duplicated the parsing rule in two
 * layers.
 *
 * This is the ONE place that turns a raw `slash_commands` value into normalized
 * command names. Both the CLI source gate and the UI chip gate consume it so the
 * `goal`/`/goal` parity is defined once and cannot drift.
 *
 * Normalization rules (fail-closed):
 *  - accept strings only;
 *  - trim surrounding whitespace;
 *  - lowercase;
 *  - strip a SINGLE leading `/` (so `//goal` stays `/goal`, not `goal`);
 *  - reject empty / slash-only / non-string values.
 */
export declare function normalizeClaudeSlashCommandName(value: unknown): string | null;
/**
 * Normalize a raw `slash_commands` value into the list of supported command
 * names. Returns an empty list for any non-array (fail-closed) and drops every
 * malformed entry.
 */
export declare function readClaudeSlashCommandNames(value: unknown): readonly string[];
/**
 * Whether the runtime `slash_commands` list advertises `commandName`. Both the
 * list entries and the queried name are normalized, so `goal` and `/goal` match
 * either way. Fail-closed: a non-array list or an unparsable query name is
 * treated as unsupported.
 */
export declare function isClaudeSlashCommandSupported(slashCommands: unknown, commandName: 'goal' | string): boolean;
//# sourceMappingURL=slashCommands.d.ts.map