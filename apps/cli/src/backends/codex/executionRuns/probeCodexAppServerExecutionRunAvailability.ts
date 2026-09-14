import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { commandExistsInPath } from '@/daemon/service/commandExistsInPath';
import { resolveWindowsCommandInvocation } from '@happier-dev/cli-common/process';
import { resolveCodexAppServerCommand } from '@/backends/codex/utils/resolveCodexCliInvocation';

function looksLikeFilePath(command: string): boolean {
  return command.includes('/') || command.includes('\\') || command.startsWith('.');
}

function readProbeTimeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(String(env.HAPPIER_CODEX_APP_SERVER_PROBE_TIMEOUT_MS ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1_500;
}

function supportsAppServerSubcommand(command: string, env: NodeJS.ProcessEnv): boolean {
  try {
    const invocation = resolveWindowsCommandInvocation({
      command,
      args: ['app-server', '--help'],
      resolveCommandOnPath: true,
    });
    const result = spawnSync(invocation.command, invocation.args, {
      env,
      timeout: readProbeTimeoutMs(env),
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      stdio: 'ignore',
    });
    return result.status === 0 && !result.error;
  } catch {
    return false;
  }
}

export function probeCodexAppServerExecutionRunAvailability(opts: Readonly<{
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}> = {}): boolean {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const command = resolveCodexAppServerCommand(env, cwd);
  if (!command) return false;

  const exists = looksLikeFilePath(command)
    ? (() => {
        try {
          if (!existsSync(command)) return false;
          const stats = statSync(command);
          if (!stats.isFile()) return false;
          accessSync(command, constants.X_OK);
          return true;
        } catch {
          return false;
        }
      })()
    : commandExistsInPath({
        cmd: command,
        envPath: env.PATH,
        platform: process.platform,
        pathext: env.PATHEXT,
      });
  return exists && supportsAppServerSubcommand(command, env);
}
