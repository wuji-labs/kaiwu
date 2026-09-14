import chalk from 'chalk';

import type { Credentials } from '@/persistence';
import { ExecutionRunTurnStreamStartRequestSchema } from '@happier-dev/protocol';

import { wantsJson, printJsonEnvelope, writeJsonStdout } from '@/cli/output/jsonEnvelope';
import { hasFlag, readCommandPositionals } from '@/cli/commands/shared/argvFlags';
import { resolveSessionTransportContext } from '@/session/services/resolveSessionTransportContext';
import { startExecutionRunStream } from '@/session/services/executionRuns';

export async function cmdSessionRunStreamStart(
  argv: string[],
  deps: Readonly<{ readCredentialsFn: () => Promise<Credentials | null> }>,
): Promise<void> {
  const json = wantsJson(argv);
  const [idOrPrefix = '', runId = '', message = ''] = readCommandPositionals(argv, { startIndex: 2 });
  const resume = hasFlag(argv, '--resume');

  if (!idOrPrefix || !runId || !message) {
    throw new Error('Usage: kaiwu session run stream-start <session-id-or-prefix> <run-id> <message> [--resume] [--json]');
  }

  const credentials = await deps.readCredentialsFn();
  if (!credentials) {
    if (json) {
      await printJsonEnvelope({ ok: false, kind: 'session_run_stream_start', error: { code: 'not_authenticated' } });
      return;
    }
    console.error(chalk.red('错误:'), '未认证。请先运行 "kaiwu auth login"。');
    process.exit(1);
  }

  const sessionTarget = await resolveSessionTransportContext({ credentials, idOrPrefix });
  if (!sessionTarget.ok) {
    if (json) {
      await printJsonEnvelope({
        ok: false,
        kind: 'session_run_stream_start',
        error: { code: sessionTarget.code, ...(sessionTarget.candidates ? { candidates: sessionTarget.candidates } : {}) },
      });
      return;
    }
    throw new Error(sessionTarget.code);
  }
  const { sessionId, ctx, mode } = sessionTarget;
  const request = ExecutionRunTurnStreamStartRequestSchema.parse({ runId, message, ...(resume ? { resume: true } : {}) });
  const result = await startExecutionRunStream({ token: credentials.token, sessionId, mode, ctx, request });

  if (!result.ok) {
    if (json) {
      await printJsonEnvelope({
        ok: false,
        kind: 'session_run_stream_start',
        error: { code: result.code, ...(result.message ? { message: result.message } : {}) },
      });
      return;
    }
    throw new Error(result.message ?? result.code);
  }

  if (json) {
    await printJsonEnvelope({ ok: true, kind: 'session_run_stream_start', data: { sessionId, runId, ...(result.data as any) } });
    return;
  }

  console.log(chalk.green('✓'), '运行流已启动');
  await writeJsonStdout(result.data, { pretty: true });
}
