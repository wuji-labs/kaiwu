import chalk from 'chalk';
import os from 'node:os';

import { clearCredentials, clearMachineId } from '@/persistence';
import { resolveActiveServerAuthReadiness } from '@/auth/resolveActiveServerAuthReadiness';
import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { stopDaemon } from '@/daemon/controlClient';
import { logger } from '@/ui/logger';
import { applyServerSelectionFromArgs } from '@/server/serverSelection';
import { configuration } from '@/configuration';
import { isLoopbackServerHost } from '@/server/serverUrlClassification';
import { reconcileDefaultFollowingBackgroundServicesAfterAuthentication } from '../backgroundServiceFollowUp';

import { resolveAuthMethodFlag } from './methodFlag';

/**
 * `--wait-timeout <seconds>`: how long to keep this terminal waiting for the
 * sign-in to be approved.
 *
 * For callers that have to give the terminal back — `kaiwu setup` runs this
 * command with inherited stdio — an unbounded wait is a terminal nobody can
 * reclaim. Omitted, the wait stays unbounded, which is right for someone sitting
 * in front of a QR code.
 */
function readWaitTimeoutSecondsFlag(args: readonly string[]): number | null {
  const index = args.indexOf('--wait-timeout');
  if (index < 0) return null;
  const raw = String(args[index + 1] ?? '').trim();
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    console.error(chalk.red('--wait-timeout 需要填写正整数秒数，例如 `--wait-timeout 300`。'));
    process.exit(1);
  }
  return seconds;
}

export async function handleAuthLogin(args: string[]): Promise<void> {
  args = await applyServerSelectionFromArgs(args);

  const forceAuth = args.includes('--force') || args.includes('-f');
  const noOpen = args.includes('--no-open') || args.includes('--no-browser') || args.includes('--no-browser-open');
  const printConfigureLinks = args.includes('--print-configure-links');
  const waitTimeoutSeconds = readWaitTimeoutSecondsFlag(args);
  let method: 'web' | 'mobile' | null = null;
  try {
    method = resolveAuthMethodFlag(args);
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : '无效的 --method 参数'));
    process.exit(1);
  }
  if (method) process.env.HAPPIER_AUTH_METHOD = method;

  if (noOpen) {
    process.env.HAPPIER_NO_BROWSER_OPEN = '1';
  }

  if (printConfigureLinks) {
    process.env.HAPPIER_AUTH_PRINT_CONFIGURE_LINKS = '1';
  }

  if (waitTimeoutSeconds !== null) {
    process.env.HAPPIER_AUTH_WAIT_TIMEOUT_MS = String(waitTimeoutSeconds * 1000);
  }

  if (forceAuth) {
    console.log(chalk.yellow('已请求强制重新认证。'));
    console.log(chalk.gray('将执行以下操作：'));
    console.log(chalk.gray('  • 清除现有凭据'));
    console.log(chalk.gray('  • 清除机器 ID'));
    console.log(chalk.gray('  • 若守护进程正在运行则停止它'));
    console.log(chalk.gray('  • 重新认证并注册本机\n'));

    try {
      logger.debug('Stopping daemon for force auth...');
      await stopDaemon();
      console.log(chalk.gray('✓ 守护进程已停止'));
    } catch (error) {
      logger.debug('Daemon was not running or failed to stop:', error);
    }

    await clearCredentials();
    console.log(chalk.gray('✓ 凭据已清除'));

    await clearMachineId({ preserveReplacementCandidate: true, replacementReason: 'reauth' });
    console.log(chalk.gray('✓ 机器 ID 已清除'));

    console.log('');
  }

  if (!forceAuth) {
    // Same readiness question `auth status` answers, asked through the same
    // owner: stored bytes alone cannot tell a usable sign-in from a rejected one.
    const readiness = await resolveActiveServerAuthReadiness();
    let existingCreds = readiness.credentials;

    if (readiness.unusableReason === 'credentials-rejected') {
      console.log(chalk.yellow('⚠️  所选中继拒绝了已保存的凭据'));
      console.log(chalk.gray('  正在修复本地认证状态，然后重新登录……\n'));
      try {
        logger.debug('Stopping daemon before auth repair...');
        await stopDaemon();
        console.log(chalk.gray('✓ 守护进程已停止'));
      } catch (error) {
        logger.debug('Daemon was not running or failed to stop during auth repair:', error);
      }
      await clearCredentials();
      await clearMachineId({ preserveReplacementCandidate: true, replacementReason: 'reauth' });
      existingCreds = null;
    }

    if (existingCreds && readiness.credentialState === 'unknown') {
      console.log(chalk.yellow('⚠️  所选中继未响应，无法验证已保存的登录状态'));
      console.log(chalk.gray('  已保留现有凭据，未作修改。'));
      if (readiness.machineRegistered) {
        console.log(chalk.gray('  请在中继恢复可用后重试此命令。'));
        return;
      }
      console.log(chalk.gray('  将使用已保存的凭据重试机器注册。\n'));
    }

    if (existingCreds && readiness.credentialState === 'valid' && readiness.machineRegistered) {
      console.log(chalk.green('✓ 已完成认证'));
      console.log(chalk.gray(`  机器 ID：${readiness.machineId}`));
      console.log(chalk.gray(`  主机：${os.hostname()}`));
      console.log(chalk.gray(`  如需重新认证，请运行 'kaiwu auth login --force'`));
      await reconcileDefaultFollowingBackgroundServicesAfterAuthentication({ restartExisting: false });
      return;
    }

    if (existingCreds && !readiness.machineRegistered) {
      console.log(chalk.yellow('⚠️  已找到凭据，但缺少机器 ID'));
      console.log(chalk.gray('  这可能是之前使用过 --auth 参数造成的'));
      console.log(chalk.gray('  正在通过机器设置流程修复……\n'));
    }

    if (!existingCreds && !method && isLoopbackServerHost(configuration.serverUrl)) {
      process.env.HAPPIER_AUTH_METHOD = 'web';
      console.log(chalk.yellow(`所选中继（${configuration.serverUrl}）只能从本机访问。`));
      console.log(chalk.gray('将使用本机浏览器发起新的登录请求。\n'));
    }
  } else if (!method && isLoopbackServerHost(configuration.serverUrl)) {
    process.env.HAPPIER_AUTH_METHOD = 'web';
    console.log(chalk.yellow(`所选中继（${configuration.serverUrl}）只能从本机访问。`));
    console.log(chalk.gray('将使用本机浏览器发起新的登录请求。\n'));
  }

  try {
    const result = await authAndSetupMachineIfNeeded();
    console.log(chalk.green('\n✓ 认证成功'));
    console.log(chalk.gray(`  机器 ID：${result.machineId}`));
    await reconcileDefaultFollowingBackgroundServicesAfterAuthentication();
  } catch (error) {
    console.error(chalk.red('认证失败：'), error instanceof Error ? error.message : '未知错误');
    process.exit(1);
  }
}
