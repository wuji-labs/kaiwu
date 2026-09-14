import chalk from 'chalk';

import type { CommandContext } from '@/cli/commandRegistry';
import { printJsonEnvelope, wantsJson } from '@/cli/output/jsonEnvelope';

function usage(): string {
  return [
    `${chalk.bold('kaiwu plugins')} - 插件兼容命令`,
    '',
    `${chalk.bold('用法:')}`,
    '  kaiwu plugins list [--json]',
    '',
    '当前版本的开物不支持安装插件。',
  ].join('\n');
}

export async function handlePluginsCompatibilityCliCommand(context: CommandContext): Promise<void> {
  const args = context.args.slice(1);
  const subcommand = args.find((arg) => !arg.startsWith('-')) ?? 'help';
  const json = wantsJson(args);

  if (subcommand === 'list') {
    if (json) {
      await printJsonEnvelope({ ok: true, kind: 'plugins_list', data: { plugins: [] } });
    } else {
      console.log('未安装插件。');
    }
    return;
  }

  if (subcommand === 'help') {
    console.log(usage());
    return;
  }

  if (json) {
    await printJsonEnvelope({
      ok: false,
      kind: 'plugins_unsupported',
      error: {
        code: 'unsupported_in_this_version',
        message: `当前版本的开物不支持插件命令“${subcommand}”`,
      },
    });
    return;
  }

  console.error(chalk.red('错误：'), `当前版本的开物不支持插件命令“${subcommand}”`);
  console.log(usage());
  process.exitCode = 1;
}
