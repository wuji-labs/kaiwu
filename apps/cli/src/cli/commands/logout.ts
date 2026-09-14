import chalk from 'chalk';

import { handleAuthCommand } from '@/cli/commands/auth';

import type { CommandContext } from '@/cli/commandRegistry';

export async function handleLogoutCliCommand(_context: CommandContext): Promise<void> {
  console.log(chalk.yellow('提示：“kaiwu logout” 已废弃，请改用 “kaiwu auth logout”。\n'));
  try {
    await handleAuthCommand(['logout']);
  } catch (error) {
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
