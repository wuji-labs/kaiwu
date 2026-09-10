import { describe, expect, it, vi } from 'vitest';

import { captureConsoleText } from '@/testkit/logger/captureOutput';
import { SESSION_CREATE_USAGE } from './create/parseSessionCreateSpawnOptions';

describe('handleSessionCommand help output', () => {
  it('lists the direct session control subcommands and run subcommands', async () => {
    const { handleSessionCommand } = await import('./handleSessionCommand');
    const output = captureConsoleText();

    try {
      await handleSessionCommand(['--help']);

      expect(output.text()).toContain('kaiwu session list [--active] [--archived] [--limit N] [--cursor C] [--include-system] [--resumable] [--plain] [--json]');
      expect(output.text()).toContain('kaiwu resume [<session-id-or-prefix>]');
      expect(output.text()).toContain('kaiwu session status <session-id-or-prefix-or-tag> [--live] [--json]');
      expect(output.text()).toContain(SESSION_CREATE_USAGE);
      expect(output.text()).toContain('kaiwu session send <session-id-or-prefix-or-tag> <message> [--permission-mode <mode>] [--model <model-id>] [--wait] [--timeout <seconds>] [--json]');
      expect(output.text()).toContain('kaiwu session wait <session-id-or-prefix-or-tag> [--timeout <seconds>] [--json]');
      expect(output.text()).toContain('kaiwu session stop <session-id-or-prefix-or-tag> [--json]');
      expect(output.text()).toContain('kaiwu session set-title <session-id-or-prefix-or-tag> <title> [--json]');
      expect(output.text()).toContain('kaiwu session set-permission-mode <session-id-or-prefix-or-tag> <mode> [--json]');
      expect(output.text()).toContain('kaiwu session set-model <session-id-or-prefix-or-tag> <model-id> [--json]');
      expect(output.text()).toContain('kaiwu session archive <session-id-or-prefix-or-tag> [--json]');
      expect(output.text()).toContain('kaiwu session unarchive <session-id-or-prefix-or-tag> [--json]');
      expect(output.text()).toContain('kaiwu session history <session-id-or-prefix-or-tag> [--limit N] [--format compact|raw] [--include-meta] [--include-structured-payload] [--json]');
      expect(output.text()).toContain('kaiwu session actions list [--json]');
      expect(output.text()).toContain('kaiwu session actions describe <action-id> [--json]');
      expect(output.text()).toContain('kaiwu session actions execute <session-id-or-prefix-or-tag> <action-id> [--input-json <json>] [--action-request-id <id>] [--resume-action-request] [--json]');
      expect(output.text()).toContain('kaiwu session run start <session-id-or-prefix-or-tag> --intent <review|plan|delegate|voice_agent|memory_hints> --backend <backend-target> [--instructions <text>] [--permission-mode <mode>] [--retention <ephemeral|resumable>] [--run-class <bounded|long_lived>] [--io-mode <request_response|streaming>] [--json]');
      expect(output.text()).toContain('kaiwu session run list <session-id-or-prefix-or-tag> [--backend <backend-target>] [--status <running|succeeded|failed|cancelled|timeout>] [--limit <count>] [--json]');
      expect(output.text()).toContain('[--retention <ephemeral|resumable>]');
      expect(output.text()).toContain('[--run-class <bounded|long_lived>]');
      expect(output.text()).toContain('[--io-mode <request_response|streaming>]');
      expect(output.text()).toContain('[--status <running|succeeded|failed|cancelled|timeout>]');
      expect(output.text()).toContain('kaiwu session run send <session-id-or-prefix-or-tag> <run-id> <message> [--resume] [--json]');
      expect(output.text()).toContain('kaiwu session run stop <session-id-or-prefix-or-tag> <run-id> [--json]');
      expect(output.text()).toContain('kaiwu session run action <session-id-or-prefix-or-tag> <run-id> <action-id> [--input-json <json>] [--json]');
      expect(output.text()).toContain('kaiwu session run wait <session-id-or-prefix-or-tag> <run-id> [--timeout <seconds>] [--json]');
    } finally {
      output.restore();
    }
  });

  it.each([
    [['list', '--help'], 'kaiwu session list [--active]'],
    [['status', '--help'], 'kaiwu session status <session-id-or-prefix-or-tag>'],
    [['create', '--help'], 'kaiwu session create [options]\n\nOptions:\n  [--path <path>]'],
    [['send', '--help'], 'kaiwu session send <session-id-or-prefix-or-tag> <message>'],
    [['wait', '--help'], 'kaiwu session wait <session-id-or-prefix-or-tag>'],
    [['stop', '--help'], 'kaiwu session stop <session-id-or-prefix-or-tag>'],
    [['history', '--help'], 'kaiwu session history <session-id-or-prefix-or-tag>'],
    [['set-title', '--help'], 'kaiwu session set-title <session-id-or-prefix-or-tag> <title>'],
    [['set-permission-mode', '--help'], 'kaiwu session set-permission-mode <session-id-or-prefix-or-tag> <mode>'],
    [['set-model', '--help'], 'kaiwu session set-model <session-id-or-prefix-or-tag> <model-id>'],
    [['archive', '--help'], 'kaiwu session archive <session-id-or-prefix-or-tag>'],
    [['unarchive', '--help'], 'kaiwu session unarchive <session-id-or-prefix-or-tag>'],
    [['review', '--help'], 'kaiwu session review start <session-id-or-prefix-or-tag>'],
    [['review', 'start', '--help'], 'kaiwu session review start <session-id-or-prefix-or-tag>'],
    [['plan', '--help'], 'kaiwu session plan start <session-id-or-prefix-or-tag>'],
    [['plan', 'start', '--help'], 'kaiwu session plan start <session-id-or-prefix-or-tag>'],
    [['delegate', '--help'], 'kaiwu session delegate start <session-id-or-prefix-or-tag>'],
    [['delegate', 'start', '--help'], 'kaiwu session delegate start <session-id-or-prefix-or-tag>'],
    [['voice-agent', '--help'], 'kaiwu session voice-agent start <session-id-or-prefix-or-tag>'],
    [['voice-agent', 'start', '--help'], 'kaiwu session voice-agent start <session-id-or-prefix-or-tag>'],
    [['actions', '--help'], 'kaiwu session actions list [--json]'],
    [['actions', 'list', '--help'], 'kaiwu session actions list [--json]'],
    [['actions', 'describe', '--help'], 'kaiwu session actions describe <action-id>'],
    [['actions', 'execute', '--help'], 'kaiwu session actions execute <session-id-or-prefix-or-tag> <action-id>'],
    [['run', '--help'], 'kaiwu session run start <session-id-or-prefix-or-tag> --intent <review|plan|delegate|voice_agent|memory_hints>'],
    [['run', 'start', '--help'], 'kaiwu session run start <session-id-or-prefix-or-tag> --intent <review|plan|delegate|voice_agent|memory_hints>'],
    [['run', 'list', '--help'], 'kaiwu session run list <session-id-or-prefix-or-tag>'],
    [['run', 'get', '--help'], 'kaiwu session run get <session-id-or-prefix-or-tag> <run-id>'],
    [['run', 'send', '--help'], 'kaiwu session run send <session-id-or-prefix-or-tag> <run-id> <message>'],
    [['run', 'stop', '--help'], 'kaiwu session run stop <session-id-or-prefix-or-tag> <run-id>'],
    [['run', 'action', '--help'], 'kaiwu session run action <session-id-or-prefix-or-tag> <run-id> <action-id>'],
    [['run', 'wait', '--help'], 'kaiwu session run wait <session-id-or-prefix-or-tag> <run-id>'],
    [['run', 'stream-start', '--help'], 'kaiwu session run stream-start <session-id-or-prefix-or-tag> <run-id> <message>'],
    [['run', 'stream-read', '--help'], 'kaiwu session run stream-read <session-id-or-prefix-or-tag> <run-id> <stream-id>'],
    [['run', 'stream-cancel', '--help'], 'kaiwu session run stream-cancel <session-id-or-prefix-or-tag> <run-id> <stream-id>'],
  ] as const)('prints usage for `%s` without prompting for credentials', async (argv, expectedUsage) => {
    const { handleSessionCommand } = await import('./handleSessionCommand');
    const output = captureConsoleText();
    const readCredentialsFn = vi.fn(async () => {
      throw new Error('credentials must not be read for session help');
    });

    try {
      await handleSessionCommand([...argv], { readCredentialsFn });

      expect(output.text()).toContain(expectedUsage);
      expect(output.text()).not.toContain('Not authenticated');
      expect(readCredentialsFn).not.toHaveBeenCalled();
    } finally {
      output.restore();
    }
  });
});
