/**
 * Name under which the built-in Kaiwu MCP bridge is registered with every provider.
 * Models see its tools as `mcp__kaiwu__<tool>` (Claude/Codex) or `kaiwu_<tool>` (OpenCode).
 */
export const KAIWU_MCP_SERVER_NAME = 'kaiwu';

/**
 * Pre-rename server name, still recognized everywhere a tool name is matched. Resumed sessions
 * need no alias: a fresh Claude CLI process declares departed ToolSearch references itself.
 */
export const LEGACY_KAIWU_MCP_SERVER_NAME = 'happier';

export function isKaiwuMcpServerName(name: string): boolean {
  return name === KAIWU_MCP_SERVER_NAME || name === LEGACY_KAIWU_MCP_SERVER_NAME;
}
