/**
 * Name under which the built-in Kaiwu MCP bridge is registered with every provider.
 * Models see its tools as `mcp__kaiwu__<tool>` (Claude/Codex) or `kaiwu_<tool>` (OpenCode).
 */
export const KAIWU_MCP_SERVER_NAME = 'kaiwu';

/**
 * Pre-rename server name. Still recognized everywhere a tool name is matched, and re-registered
 * as an alias for resumed Claude sessions whose transcripts reference `mcp__happier__*`
 * (Claude CLI rejects turns whose ToolSearch references point at tools that no longer exist).
 */
export const LEGACY_KAIWU_MCP_SERVER_NAME = 'happier';

export function isKaiwuMcpServerName(name: string): boolean {
  return name === KAIWU_MCP_SERVER_NAME || name === LEGACY_KAIWU_MCP_SERVER_NAME;
}
