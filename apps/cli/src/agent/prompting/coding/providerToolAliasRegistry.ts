import { KAIWU_MCP_SERVER_NAME } from '@/agent/runtime/kaiwuMcpServerName';

export function resolvePreferredChangeTitleToolNameForProvider(_providerId: string | null | undefined): string {
  return `mcp__${KAIWU_MCP_SERVER_NAME}__change_title`;
}
