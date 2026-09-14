import { describe, expect, it } from 'vitest';

import {
  REMOTE_CONTROL_CONFIRM_EXIT,
  REMOTE_CONTROL_CONFIRM_SWITCH,
  REMOTE_CONTROL_EXITING,
  REMOTE_CONTROL_PROMPT_SWITCH,
  REMOTE_CONTROL_SWITCHING,
  REMOTE_CONTROL_WAITING,
  formatRemoteControlDebugLogs,
  formatRemoteControlExitOnlyPrompt,
  formatRemoteControlHeader,
} from './RemoteControlDisplay';

describe('RemoteControlDisplay UI strings', () => {
  it('provides Simplified Chinese status and keybinding prompts', () => {
    expect(REMOTE_CONTROL_WAITING).toBe('等待消息中...');
    expect(REMOTE_CONTROL_EXITING).toBe('正在退出...');
    expect(REMOTE_CONTROL_SWITCHING).toBe('正在切换至本地模式...');
    expect(REMOTE_CONTROL_CONFIRM_EXIT).toBe('⚠️ 再次按 Ctrl-C 完全退出');
    expect(REMOTE_CONTROL_CONFIRM_SWITCH).toBe('⏸️ 再次按空格键（或 Ctrl-T）切换至本地模式');
    expect(REMOTE_CONTROL_PROMPT_SWITCH).toBe('📱 按空格键（或 Ctrl-T）切换至本地模式 • 按 Ctrl-C 退出');
    expect(formatRemoteControlHeader('Codex')).toBe('📡 远程模式 - Codex 消息');
    expect(formatRemoteControlExitOnlyPrompt('Claude Code')).toBe('Claude Code 远程模式 • 按 Ctrl-C 退出');
    expect(formatRemoteControlDebugLogs('/tmp/debug.log')).toBe('调试日志: /tmp/debug.log');
  });
});
