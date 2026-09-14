import chalk from 'chalk';

import { runAutomationNow, type AutomationRunSummary } from '@/api/automations';
import type { CommandContext } from '@/cli/commandRegistry';
import { mapUnknownErrorToControlError } from '@/cli/control/controlErrorMapping';
import { printJsonEnvelope, wantsJson } from '@/cli/output/jsonEnvelope';
import { readCredentials } from '@/persistence';

type AutomationCommandDeps = Readonly<{
  readCredentialsFn: typeof readCredentials;
  runAutomationNowFn: (params: Readonly<{
    token: string;
    automationId: string;
    idempotencyKey?: string | null;
  }>) => Promise<AutomationRunSummary>;
}>;

const DEFAULT_DEPS: AutomationCommandDeps = {
  readCredentialsFn: readCredentials,
  runAutomationNowFn: runAutomationNow,
};

function showAutomationHelp(): void {
  console.log(`
${chalk.bold('kaiwu automation')} - 管理自动化任务

${chalk.bold('用法:')}
  kaiwu automation run <automation-id> [--idempotency-key <key>] [--json]

${chalk.bold('命令:')}
  run    通过自动化任务现有的分配立即排队执行

${chalk.bold('选项:')}
  --idempotency-key <key>  触发重试时复用同一次运行
  --json                   输出机器可读结果
`);
}

function parseRunArgs(args: readonly string[]): Readonly<{
  automationId: string;
  idempotencyKey: string | null;
}> {
  const positionals: string[] = [];
  let idempotencyKey: string | null = null;

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index] ?? '';
    if (value === '--json') continue;
    if (value === '--idempotency-key') {
      const next = args[index + 1]?.trim();
      if (!next || next.startsWith('-')) {
        throw new Error('缺少 --idempotency-key 的值');
      }
      idempotencyKey = next;
      index += 1;
      continue;
    }
    if (value.startsWith('--idempotency-key=')) {
      idempotencyKey = value.slice('--idempotency-key='.length).trim();
      if (!idempotencyKey) throw new Error('缺少 --idempotency-key 的值');
      continue;
    }
    if (value.startsWith('-')) {
      throw new Error(`未知的 automation run 选项：${value}`);
    }
    positionals.push(value.trim());
  }

  if (positionals.length !== 1 || !positionals[0]) {
    throw new Error('用法：kaiwu automation run <automation-id> [--idempotency-key <key>] [--json]');
  }
  if (idempotencyKey && idempotencyKey.length > 191) {
    throw new Error('--idempotency-key 最多只能有 191 个字符');
  }
  return { automationId: positionals[0], idempotencyKey };
}

export async function handleAutomationCommand(
  args: string[],
  deps: AutomationCommandDeps = DEFAULT_DEPS,
): Promise<void> {
  const subcommand = args[0];
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    showAutomationHelp();
    return;
  }
  if (subcommand !== 'run') {
    throw new Error(`未知的 automation 子命令：${subcommand}`);
  }

  const parsed = parseRunArgs(args);
  const credentials = await deps.readCredentialsFn();
  if (!credentials) {
    const error = new Error('尚未登录。请先运行 "kaiwu auth login"。');
    (error as Error & { code?: string }).code = 'not_authenticated';
    throw error;
  }

  const run = await deps.runAutomationNowFn({
    token: credentials.token,
    automationId: parsed.automationId,
    ...(parsed.idempotencyKey ? { idempotencyKey: parsed.idempotencyKey } : {}),
  });
  if (wantsJson(args)) {
    await printJsonEnvelope({ ok: true, kind: 'automation_run', data: { run } });
    return;
  }
  console.log(chalk.green(`已将自动化任务运行加入队列：${run.id}`));
}

export async function handleAutomationCliCommand(context: CommandContext): Promise<void> {
  const args = context.args.slice(1);
  try {
    await handleAutomationCommand(args);
  } catch (error) {
    if (wantsJson(args)) {
      const mapped = mapUnknownErrorToControlError(error);
      await printJsonEnvelope(
        {
          ok: false,
          kind: 'automation_run',
          error: { code: mapped.code, ...(mapped.message ? { message: mapped.message } : {}) },
        },
        { exitCode: mapped.unexpected ? 2 : 1 },
      );
      return;
    }
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    process.exitCode = 1;
  }
}
