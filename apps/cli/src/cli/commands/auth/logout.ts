import chalk from 'chalk';
import { existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  clearCredentials,
  readCredentials,
  updateSettings,
} from '@/persistence';
import { configuration } from '@/configuration';
import { stopDaemon } from '@/daemon/controlClient';
import { stopAllDaemonsBestEffort } from '@/daemon/multiDaemon';
import { clearServerScopedAuthStateInSettings } from './clearServerScopedAuthState';

export async function handleAuthLogout(args: string[]): Promise<void> {
  const logoutAll = args.includes('--all');
  const happyDir = configuration.happyHomeDir;
  const targetServerId = configuration.activeServerId;

  if (!logoutAll) {
    const credentials = await readCredentials();
    if (!credentials) {
      console.log(chalk.yellow('当前未完成认证'));
      return;
    }
  }

  if (logoutAll) {
    console.log(chalk.blue('这将退出开物在所有中继上的登录，并删除本地数据'));
  } else {
    console.log(chalk.blue(`这将退出开物在以下中继上的登录：${targetServerId}`));
  }
  console.log(chalk.yellow('⚠️  之后需要重新认证才能再次使用开物'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(
      chalk.yellow(logoutAll
        ? '确定要退出所有中继并删除本地数据吗？（y/N）：'
        : '确定要退出登录吗？（y/N）：'),
      resolve,
    );
  });

  rl.close();

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    try {
      if (logoutAll) {
        try {
          await stopAllDaemonsBestEffort();
        } catch {
          // best-effort
        }
        if (existsSync(happyDir)) {
          rmSync(happyDir, { recursive: true, force: true });
        }
      } else {
        try {
          await stopDaemon();
          console.log(chalk.gray('守护进程已停止'));
        } catch {
          // ignore
        }

        await clearCredentials();

        await updateSettings((settings) => {
          return clearServerScopedAuthStateInSettings(settings, targetServerId);
        });
      }

      console.log(chalk.green('✓ 已成功退出登录'));
      console.log(chalk.gray('  如需重新认证，请运行 "kaiwu auth login"'));
    } catch (error) {
      throw new Error(`退出登录失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
    return;
  }

  console.log(chalk.blue('已取消退出登录'));
}
