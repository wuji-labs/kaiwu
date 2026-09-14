import type { CommandContext } from '@/cli/commandRegistry';
import { handleServiceRepairCliCommand } from './serviceRepair/handleServiceRepairCliCommand';

export async function handleStatusCliCommand(context: CommandContext): Promise<void> {
  if (context.args.includes('--yes')) {
    throw new Error('kaiwu status 仅用于查看。请使用 `kaiwu doctor repair --yes` 应用修复。');
  }

  await handleServiceRepairCliCommand({
    argv: ['repair', '--report-only', ...context.args.slice(1)],
    commandPath: 'kaiwu status',
  });
}
