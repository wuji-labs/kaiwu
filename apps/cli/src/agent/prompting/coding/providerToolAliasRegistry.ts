import { KAIWU_MCP_SERVER_NAME } from '@/agent/runtime/kaiwuMcpServerName';
import { resolveOpenCodeChangeTitleToolNameForMcpClient } from '@/backends/opencode/server/openCodeMcpToolNames';

export function resolvePreferredChangeTitleToolNameForProvider(providerId: string | null | undefined): string {
  const normalized = typeof providerId === 'string' ? providerId.trim() : '';
  if (normalized === 'opencode') {
    return resolveOpenCodeChangeTitleToolNameForMcpClient(KAIWU_MCP_SERVER_NAME);
  }
  return `mcp__${KAIWU_MCP_SERVER_NAME}__change_title`;
}
