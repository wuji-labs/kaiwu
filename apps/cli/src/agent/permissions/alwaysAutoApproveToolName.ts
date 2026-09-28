import { isChangeTitleToolLikeName, isSendFileToUserToolLikeName } from '@happier-dev/protocol/tools/v2';

const TRUSTED_SAFE_TOOL_NAMES = new Set([
  'think',
  'save_memory',
  'mcp__happier__think',
  'mcp__happier__save_memory',
  'mcp__happy__think',
  'mcp__happy__save_memory',
  'happier__think',
  'happier__save_memory',
  'happy__think',
  'happy__save_memory',
  'happier_think',
  'happier_save_memory',
  'happy_think',
  'happy_save_memory',
]);

export function isTrustedAlwaysAutoApproveToolName(
  toolName: string,
  additionalExactNames: readonly string[] = [],
): boolean {
  const normalized = String(toolName ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (isChangeTitleToolLikeName(normalized)) return true;
  if (isSendFileToUserToolLikeName(normalized)) return true;
  if (TRUSTED_SAFE_TOOL_NAMES.has(normalized)) return true;
  return additionalExactNames.some((name) => normalized === name.trim().toLowerCase());
}
