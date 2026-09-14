import chalk from 'chalk';
import os from 'node:os';

import { resolveActiveServerAuthReadiness } from '@/auth/resolveActiveServerAuthReadiness';
import { configuration } from '@/configuration';
import { checkIfDaemonRunningAndCleanupStaleState } from '@/daemon/controlClient';
import { printJsonEnvelope, wantsJson } from '@/cli/output/jsonEnvelope';
import { applyServerSelectionFromArgs } from '@/server/serverSelection';

export async function handleAuthStatus(argv: string[] = []): Promise<void> {
  const args = await applyServerSelectionFromArgs(argv);
  const json = wantsJson(args);
  const readiness = await resolveActiveServerAuthReadiness();
  const credentials = readiness.credentials;

  if (json && !credentials) {
    await printJsonEnvelope({ ok: false, kind: 'auth_status', error: { code: 'not_authenticated' } });
    return;
  }

  if (!json) {
    console.log(chalk.bold('\n认证状态\n'));
  }

  if (!credentials) {
    console.log(chalk.red('✗ 未完成认证'));
    console.log(chalk.gray('  请运行 "kaiwu auth login" 完成认证'));
    return;
  }

  if (readiness.unusableReason === 'credentials-rejected') {
    if (json) {
      await printJsonEnvelope({ ok: false, kind: 'auth_status', error: { code: 'not_authenticated' } });
      return;
    }

    console.log(chalk.red('✗ 未完成认证'));
    console.log(chalk.gray('  所选中继拒绝了已保存的凭据'));
    console.log(chalk.gray('  请运行 "kaiwu auth login --force" 重新认证'));
    return;
  }

  if (readiness.credentialState === 'unknown') {
    if (json) {
      await printJsonEnvelope({
        ok: false,
        kind: 'auth_status',
        error: {
          code: 'auth_unavailable',
          message: '所选中继未响应；已保留现有凭据。',
          machineRegistered: readiness.machineRegistered,
          ...(readiness.machineRegistered && readiness.machineId ? { machineId: readiness.machineId } : {}),
        },
      });
      return;
    }

    console.log(chalk.yellow('⚠️  所选中继未响应，无法验证认证状态'));
    console.log(chalk.gray('  已保留现有凭据，未作修改。请在中继恢复可用后重试。'));
    return;
  }

  const { machineId, machineRegistered } = readiness;

  let daemonRunning = false;
  try {
    daemonRunning = await checkIfDaemonRunningAndCleanupStaleState();
  } catch {
    daemonRunning = false;
  }

  if (json) {
    await printJsonEnvelope({
      ok: true,
      kind: 'auth_status',
      data: {
        authenticated: true,
        encryption: { type: credentials.encryption.type },
        machineRegistered,
        ...(machineRegistered && machineId ? { machineId } : {}),
        host: os.hostname(),
        happyHomeDir: configuration.happyHomeDir,
        daemonRunning,
      },
    });
    return;
  }

  console.log(chalk.green('✓ 已完成认证'));

  if (machineRegistered) {
    console.log(chalk.green('✓ 本机已注册'));
    console.log(chalk.gray(`  机器 ID：${machineId}`));
    console.log(chalk.gray(`  主机：${os.hostname()}`));
  } else {
    console.log(chalk.yellow('⚠️  本机尚未注册'));
    console.log(chalk.gray('  请运行 "kaiwu auth login --force" 修复'));
  }

    console.log(chalk.gray(`\n  数据目录：${configuration.happyHomeDir}`));

  if (daemonRunning) {
    console.log(chalk.green('✓ 守护进程正在运行'));
  } else {
    console.log(chalk.gray('✗ 守护进程未运行'));
  }
}
