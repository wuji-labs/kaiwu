import chalk from 'chalk';

import { handleAuthCommand } from '@/cli/commands/auth';

import type { CommandContext } from '@/cli/commandRegistry';

export async function handleLogoutCliCommand(_context: CommandContext): Promise<void> {
  console.log(chalk.yellow('Note: "kaiwu logout" is deprecated. Use "kaiwu auth logout" instead.\n'));
  try {
    await handleAuthCommand(['logout']);
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
