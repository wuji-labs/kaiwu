import { describe, expect, it } from 'vitest';

import {
  DAEMON_PROMPT_BENEFITS,
  DAEMON_PROMPT_FOOTER,
  DAEMON_PROMPT_INTRO,
  DAEMON_PROMPT_OPTIONS,
  DAEMON_PROMPT_QUESTION,
  DAEMON_PROMPT_TITLE,
} from './DaemonPrompt';

describe('DaemonPrompt UI strings', () => {
  it('provides Simplified Chinese labels, descriptions, and hints', () => {
    expect(DAEMON_PROMPT_TITLE).toBe('🚀 Kaiwu 守护进程设置');
    expect(DAEMON_PROMPT_INTRO).toBe('📱 Kaiwu 可以运行后台服务，以便你：');
    expect(DAEMON_PROMPT_BENEFITS).toEqual([
      '• 从手机发起新对话',
      '• 远程继续已关闭的对话',
      '• 只要电脑保持联网即可与 Claude 协同工作',
    ]);
    expect(DAEMON_PROMPT_QUESTION).toBe('是否希望 Kaiwu 自动启动此服务？');
    expect(DAEMON_PROMPT_OPTIONS).toEqual([
      { value: true, label: '是（推荐）', key: 'Y' },
      { value: false, label: '否', key: 'N' },
    ]);
    expect(DAEMON_PROMPT_FOOTER).toBe('按 Y/N 或使用方向键 + Enter 选择');
  });
});
