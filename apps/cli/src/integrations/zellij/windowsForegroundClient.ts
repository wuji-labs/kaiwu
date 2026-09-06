import { startProcessInWindowsTerminal } from '@/terminal/windows/windowsTerminalProcess';

import type { ZellijForegroundClientLaunchParams } from './adapter';

export function createWindowsTerminalZellijForegroundClientLauncher(params?: Readonly<{
  windowId?: string;
  titlePrefix?: string;
}>): (launchParams: ZellijForegroundClientLaunchParams) => Promise<void> {
  const windowId = params?.windowId ?? 'happier-claude-unified-zellij';
  const titlePrefix = params?.titlePrefix ?? 'Kaiwu Claude';
  return async (launchParams) => {
    const args = ['attach', '--create', launchParams.sessionName];
    if (launchParams.cwd || launchParams.defaultShell) {
      args.push('options');
      if (launchParams.cwd) {
        args.push('--default-cwd', launchParams.cwd);
      }
      if (launchParams.defaultShell) {
        args.push('--default-shell', launchParams.defaultShell);
      }
    }
    const result = await startProcessInWindowsTerminal({
      filePath: launchParams.zellijBinary,
      args,
      workingDirectory: launchParams.cwd ?? process.cwd(),
      env: { ...launchParams.env },
      windowId,
      title: `${titlePrefix} ${launchParams.sessionName}`,
      inheritParentEnv: false,
    });
    if (!result.ok) {
      throw new Error(`Windows Terminal zellij foreground client launch failed: ${result.errorMessage}`);
    }
  };
}
