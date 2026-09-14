import chalk from 'chalk';

import type { Credentials } from '@/persistence';
import { readCommandPositionals } from '@/cli/commands/shared/argvFlags';
import { wantsJson, printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { createCliActionExecutorFromCredentials } from '@/session/actions/createCliActionExecutorFromCredentials';
import { normalizeActionExecuteResult } from './shared/normalizeActionExecuteResult';
import { tryHandleApprovalRequestCreated } from './shared/tryHandleApprovalRequestCreated';

export async function cmdSessionStop(
  argv: string[],
  deps: Readonly<{ readCredentialsFn: () => Promise<Credentials | null> }>,
): Promise<void> {
  const json = wantsJson(argv);
  const [idOrPrefix = ''] = readCommandPositionals(argv, { startIndex: 1 });
  if (!idOrPrefix) {
    throw new Error('Usage: kaiwu session stop <session-id-or-prefix> [--json]');
  }

  const credentials = await deps.readCredentialsFn();
  if (!credentials) {
    if (json) {
      await printJsonEnvelope({ ok: false, kind: 'session_stop', error: { code: 'not_authenticated' } });
      return;
    }
    console.error(chalk.red('错误:'), '未认证。请先运行 "kaiwu auth login"。');
    process.exit(1);
  }

  const executor = createCliActionExecutorFromCredentials({ credentials });
  const actionRes = await executor.execute(
    'session.stop',
    { sessionId: idOrPrefix },
    { surface: 'cli', defaultSessionId: null },
  );
  const normalized = normalizeActionExecuteResult(actionRes as any);
  if (!normalized.ok) {
    if (json) {
      await printJsonEnvelope({
        ok: false,
        kind: 'session_stop',
        error: { code: normalized.errorCode, ...(normalized.candidates ? { candidates: normalized.candidates } : {}), ...(normalized.errorMessage ? { message: normalized.errorMessage } : {}) },
      });
      return;
    }
    throw new Error(normalized.errorCode);
  }

  const result = normalized.data as any;
  if (await tryHandleApprovalRequestCreated({ envelopeKind: 'session_stop', json, result })) {
    return;
  }
  if (json) {
    await printJsonEnvelope({
      ok: true,
      kind: 'session_stop',
      data: {
        sessionId: result.sessionId,
        stopped: result.stopped,
        ...(result.stopOutcome ? { stopOutcome: result.stopOutcome } : {}),
      },
    });
    return;
  }

  if (result.stopped) {
    console.log(chalk.green('✓'), '会话已停止');
    return;
  }

  // A confirmed stop with nothing to signal. Before the stop owner could name
  // this state it fell through to "stop could not be confirmed", which told the
  // user an already-stopped Session was indeterminate.
  if (result.stopOutcome?.status === 'already_stopped') {
    console.log(chalk.green('✓'), '会话已处于停止状态');
    return;
  }

  if (result.stopOutcome?.status === 'stopped_projection_unconfirmed') {
    console.log(chalk.yellow('!'), '会话已停止；尚未观察到状态更新');
    return;
  }

  if (result.stopOutcome?.status === 'stopped_cleanup_incomplete') {
    console.log(chalk.yellow('!'), '会话已停止；本地清理未能完成');
    return;
  }

  console.log(chalk.yellow('!'), '无法确认停止状态');
}
