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
export function normalizeClaudeSlashCommandName(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0)
        return null;
    const withoutLeadingSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    return withoutLeadingSlash.length > 0 ? withoutLeadingSlash : null;
}
/**
 * Normalize a raw `slash_commands` value into the list of supported command
 * names. Returns an empty list for any non-array (fail-closed) and drops every
 * malformed entry.
 */
export function readClaudeSlashCommandNames(value) {
    if (!Array.isArray(value))
        return [];
    const names = [];
    for (const entry of value) {
        const normalized = normalizeClaudeSlashCommandName(entry);
        if (normalized)
            names.push(normalized);
    }
    return names;
}
/**
 * Whether the runtime `slash_commands` list advertises `commandName`. Both the
 * list entries and the queried name are normalized, so `goal` and `/goal` match
 * either way. Fail-closed: a non-array list or an unparsable query name is
 * treated as unsupported.
 */
export function isClaudeSlashCommandSupported(slashCommands, commandName) {
    const target = normalizeClaudeSlashCommandName(commandName);
    if (!target)
        return false;
    return readClaudeSlashCommandNames(slashCommands).includes(target);
}
//# sourceMappingURL=slashCommands.js.map