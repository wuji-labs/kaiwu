import chalk from 'chalk';

import type { CommandContext } from '@/cli/commandRegistry';

export { handleSessionCommand } from './handleSessionCommand';

import { handleSessionCommand } from './handleSessionCommand';

export async function handleSessionCliCommand(context: CommandContext): Promise<void> {
  try {
    await handleSessionCommand(context.args.slice(1));
  } catch (error) {
    console.error(chalk.red('错误:'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
