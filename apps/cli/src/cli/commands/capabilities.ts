import chalk from 'chalk';

import type { CommandContext } from '@/cli/commandRegistry';
import { printJsonEnvelope, wantsJson, writeJsonStdout } from '@/cli/output/jsonEnvelope';
import { createCliCapabilitiesService } from '@/rpc/handlers/capabilities';

function usage(): string {
  return [
    `${chalk.bold('kaiwu capabilities')} - 查看本机能力元数据`,
    '',
    `${chalk.bold('用法:')}`,
    '  kaiwu capabilities [describe] [--json]',
    '',
  ].join('\n');
}

function resolveSubcommand(args: readonly string[]): string {
  const first = args.find((arg) => !arg.startsWith('-'));
  return first ?? 'describe';
}

export async function handleCapabilitiesCliCommand(context: CommandContext): Promise<void> {
  const args = context.args.slice(1);
  const json = wantsJson(args);
  const subcommand = resolveSubcommand(args);

  try {
    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      console.log(usage());
      return;
    }

    if (subcommand !== 'describe') {
      if (json) {
        await printJsonEnvelope({
          ok: false,
          kind: 'capabilities_unknown',
          error: { code: 'unknown_subcommand', message: `Unknown capabilities subcommand: ${subcommand}` },
        });
      } else {
        console.error(chalk.red('错误：'), `未知的 capabilities 子命令：${subcommand}`);
        console.log(usage());
        process.exitCode = 1;
      }
      return;
    }

    const service = await createCliCapabilitiesService();
    const data = service.describe();

    if (json) {
      await printJsonEnvelope({ ok: true, kind: 'capabilities_describe', data });
      return;
    }

    await writeJsonStdout(data, { pretty: true });
  } catch (error) {
    if (json) {
      await printJsonEnvelope(
        {
          ok: false,
          kind: 'capabilities_describe',
          error: {
            code: 'capabilities_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        { exitCode: 2 },
      );
      return;
    }

    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
