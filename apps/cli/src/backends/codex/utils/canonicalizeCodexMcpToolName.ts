// Codex double-prefixes the built-in server (`mcp__<server>__<server>__<tool>`); collapse it.
const BUILTIN_MCP_SERVER_PREFIXES = ['mcp__kaiwu__kaiwu__', 'mcp__happier__happier__'] as const;

export function canonicalizeCodexMcpToolName(toolName: string): string {
    const normalized = typeof toolName === 'string' ? toolName.trim() : '';
    if (!normalized) return normalized;
    for (const prefix of BUILTIN_MCP_SERVER_PREFIXES) {
        if (normalized.startsWith(prefix)) {
            const server = prefix.slice('mcp__'.length, prefix.indexOf('__', 'mcp__'.length));
            return `mcp__${server}__${normalized.slice(prefix.length)}`;
        }
    }
    return normalized;
}
