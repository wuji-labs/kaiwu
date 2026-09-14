import { describe, expect, it, vi } from 'vitest';

import { captureConsoleText } from '@/testkit/logger/captureOutput';
import { handleDaemonCliCommand } from './daemon';

vi.mock('@/daemon/controlClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/daemon/controlClient')>();
  return {
    ...actual,
    listDaemonSessions: vi.fn(async () => []),
    stopDaemonSession: vi.fn(async () => ({ status: 'stopped' })),
  };
});

describe('daemon CLI command localization', () => {
  it('prints daemon help in Simplified Chinese', async () => {
    const output = captureConsoleText();
    try {
      await handleDaemonCliCommand({
        args: ['daemon', '--help'],
        rawArgv: ['kaiwu', 'daemon', '--help'],
        terminalRuntime: null,
      });

      const text = output.text();
      expect(text).toContain('kaiwu daemon');
      expect(text).toContain('管理本地守护进程');
      expect(text).toContain('用法:');
      expect(text).toContain('启动守护进程（后台分离模式）');
      expect(text).toContain('停止手动启动的守护进程');
      expect(text).toContain('说明:');
      expect(text).toContain('清理失控进程:');
    } finally {
      output.restore();
    }
  });

  it('prints session list and stop-session messages in Simplified Chinese', async () => {
    const output = captureConsoleText();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as never);

    try {
      await handleDaemonCliCommand({
        args: ['daemon', 'list'],
        rawArgv: ['kaiwu', 'daemon', 'list'],
        terminalRuntime: null,
      });
      expect(output.text()).toContain('此守护进程未感知到活跃会话');

      await handleDaemonCliCommand({
        args: ['daemon', 'stop-session', 'sess_1'],
        rawArgv: ['kaiwu', 'daemon', 'stop-session', 'sess_1'],
        terminalRuntime: null,
      });
      expect(output.text()).toContain('会话已停止');

      await expect(handleDaemonCliCommand({
        args: ['daemon', 'stop-session'],
        rawArgv: ['kaiwu', 'daemon', 'stop-session'],
        terminalRuntime: null,
      })).rejects.toThrow(/exit:1/);
      expect(output.text()).toContain('需要会话 ID');
    } finally {
      output.restore();
      exitSpy.mockRestore();
    }
  });
});
