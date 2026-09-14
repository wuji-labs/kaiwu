import chalk from 'chalk';

import { createServerUrlComparableKey, type RestartSessionRunnerResultV1 } from '@happier-dev/protocol';

import {
  checkIfDaemonRunningAndCleanupStaleState,
  inspectDaemonRunningStateAndCleanupStaleState,
  listDaemonSessions,
  requestDaemonSessionRunnerRestart,
  restartAllDaemonSessionRunners,
  stopDaemon,
  stopDaemonSession,
} from '@/daemon/controlClient';
import type { DaemonSessionRunnerRestartMode, RestartAllDaemonSessionRunnersResult } from '@/daemon/controlClient';
import { startDaemon } from '@/daemon/startDaemon';
import {
  resolveDaemonServiceInstallationSnapshotFromEnv,
  runDaemonServiceCliCommand,
} from '@/daemon/service/cli';
import { getLatestDaemonLog } from '@/ui/logger';
import { runDoctorCommand } from '@/ui/doctor';
import { listDaemonStatusesForAllKnownServers, stopAllDaemonsBestEffort } from '@/daemon/multiDaemon';
import { spawnDetachedDaemonStartSync } from '@/daemon/runtime/spawnDetachedDaemonStartSync';
import { readCredentials } from '@/persistence';
import { resolveLaunchAgentPlistPath, resolveSystemdUserUnitPath } from '@/daemon/service/plan';
import { configuration } from '@/configuration';
import { decodeJwtPayload } from '@/cloud/decodeJwtPayload';
import { waitForDaemonRunningWithinBudget } from '@/daemon/waitForDaemonRunningWithinBudget';
import {
  readDaemonStartWaitPollMs,
  readDaemonStartWaitTimeoutMs,
} from '@/daemon/startupWaitDefaults';
import { readDaemonStatusSnapshot } from '@/daemon/statusSnapshot';
import { restartDaemonAndWait } from '@/daemon/restartDaemonAndWait';
import { handleServiceRepairCliCommand } from './serviceRepair/handleServiceRepairCliCommand';
import { evaluateCurrentDaemonOwner } from '@/daemon/ownership/evaluateCurrentDaemonOwner';
import { renderDaemonOwnerConflict } from '@/daemon/ownership/renderDaemonOwnerConflict';
import {
  buildDaemonTakeoverNotice,
  resolveDaemonTakeoverDecision,
} from '@/daemon/ownership/resolveDaemonTakeoverDecision';
import {
  evaluateDaemonStartupServiceConflict,
  renderDaemonInstalledServiceConflict,
} from '@/daemon/ownership/daemonServiceInventory';
import {
  resolveDaemonStartupSourceFromEnv,
  isDaemonStartupSourceServiceManaged,
} from '@/daemon/ownership/daemonOwnershipMetadata';
import { resolveDaemonServiceCliRuntimeFromEnv } from '@/daemon/service/cli';

import type { CommandContext } from '@/cli/commandRegistry';
import { writeJsonStdout } from '@/cli/output/jsonEnvelope';

async function printDaemonJson(payload: unknown): Promise<void> {
  await writeJsonStdout(payload);
}

function flattenDaemonMessage(title: string, lines: readonly string[]): string {
  return [title, ...lines].join(' ').trim();
}

function isManualOrLegacyManualOwner(serviceManaged: boolean | null | undefined): boolean {
  return serviceManaged !== true;
}

function isHelpFlag(arg: string | undefined): boolean {
  return arg === '--help' || arg === '-h';
}

function shouldPrintDaemonHelp(args: readonly string[]): boolean {
  if (!args.slice(1).some(isHelpFlag)) return false;

  const daemonSubcommand = args[1];
  return daemonSubcommand !== 'service'
    && daemonSubcommand !== 'install'
    && daemonSubcommand !== 'uninstall';
}

function printDaemonHelp(): void {
  console.log(`
  ${chalk.bold('kaiwu daemon')} - 管理本地守护进程

${chalk.bold('用法:')}
  kaiwu daemon start [--takeover]  启动守护进程（后台分离模式）
  kaiwu daemon restart [--takeover]  重启守护进程（停止 -> 启动）
  kaiwu daemon restart --restart-session-runners  重启守护进程，保留会话，并在当前 CLI 上重启受跟踪的会话执行器
  kaiwu daemon restart-session-runners [--session-id <id>] [--dry-run] [--force-current-cli]  在当前 CLI 上重启符合条件的受跟踪会话执行器
  kaiwu daemon stop               停止手动启动的守护进程（会话保持运行；对于已安装的后台服务，请使用 kaiwu service stop）
  kaiwu daemon stop --kill-sessions  停止手动启动的守护进程及其跟踪的会话
  kaiwu daemon stop --all         停止所有已配置中继的守护进程
  kaiwu daemon restart [--takeover]  重启守护进程
  kaiwu daemon restart --kill-sessions  重启守护进程及其跟踪的会话
  kaiwu daemon start-sync [--takeover]  以同步模式启动守护进程
  kaiwu daemon status             显示守护进程状态
  kaiwu daemon status --all       显示所有已配置中继的守护进程状态
  kaiwu daemon list               列出活跃会话
  kaiwu daemon install            启用开机自启（旧版别名）
  kaiwu daemon uninstall          禁用开机自启（旧版别名）
  kaiwu service                   管理开机自启后台服务
  kaiwu service list              列出已安装的后台服务
  kaiwu doctor repair             预览或应用推荐的开机自启修复操作
  kaiwu service repair            doctor repair 的旧版别名
  kaiwu daemon service list       service list 的旧版别名
  kaiwu daemon service repair     service repair 的旧版别名

  添加 --server/--server-url 前缀可指定此次调用的特定中继配置。
  示例: kaiwu --server company service install

  对于已安装的后台服务，请使用 kaiwu service start|stop|restart。

  若要终止所有 kaiwu 相关进程，请运行
  ${chalk.cyan('kaiwu doctor clean')}

${chalk.bold('说明:')} 守护进程是运行在此计算机上的本地 Kaiwu 进程。开机自启功能由已安装的后台服务提供 (\`kaiwu service\`)。

${chalk.bold('清理失控进程:')} 使用 ${chalk.cyan('kaiwu doctor clean')}
`);
}

function parseDaemonSessionRunnerRestartMode(args: readonly string[]): DaemonSessionRunnerRestartMode {
  return args.includes('--force-current-cli') ? 'force_current_cli' : 'if_stale';
}

function parseDaemonSessionIdOption(args: readonly string[]): string | null {
  const index = args.indexOf('--session-id');
  if (index < 0) return null;
  const value = args[index + 1]?.trim() ?? '';
  if (!value || value.startsWith('--')) return '';
  return value;
}

function printSessionRunnerRestartSummary(result: RestartAllDaemonSessionRunnersResult, dryRun: boolean): void {
  const verb = dryRun ? '拟重启' : '已重启';
  console.log(`会话执行器重启${dryRun ? '演练' : '完成'}:`);
  console.log(`  ${verb}: ${result.restartedCount}`);
  console.log(`  已跳过: ${result.skippedCount}`);
  console.log(`  失败: ${result.failedCount}`);
  console.log(`  已请求: ${result.requestedCount}`);
}

function formatSessionRunnerRestartResultLine(result: RestartSessionRunnerResultV1): string {
  const reason = result.ok ? null : result.reasonCode;
  return `  ${result.sessionId}: ${result.status}${reason ? ` (${reason})` : ''}`;
}

function printSessionRunnerRestartFailureAfterDaemonRestart(result: RestartAllDaemonSessionRunnersResult): void {
  console.error('守护进程重启后会话执行器重启失败');
  console.error(
    `  会话执行器: ${result.restartedCount} 个已重启，` +
    `${result.skippedCount} 个已跳过，${result.failedCount} 个失败`,
  );
  for (const entry of result.results) {
    console.error(formatSessionRunnerRestartResultLine(entry));
  }
}

function printSingleSessionRunnerRestartSummary(result: RestartSessionRunnerResultV1, dryRun: boolean): void {
  console.log(`会话执行器重启${dryRun ? '演练' : '完成'}:`);
  console.log(`  会话: ${result.sessionId}`);
  console.log(`  状态: ${result.status}`);
}

function isChildProcessAlive(child: Readonly<{ pid?: number }>): boolean {
  if (!child.pid) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function handleDaemonCliCommand(context: CommandContext): Promise<void> {
  const args = context.args;
  const daemonSubcommand = args[1];

  if (daemonSubcommand === 'service') {
    if (args[2] === 'repair') {
      await handleServiceRepairCliCommand({
        argv: args.slice(2),
        commandPath: 'kaiwu doctor',
      });
      return;
    }
    await runDaemonServiceCliCommand({ argv: args.slice(2) });
    return;
  }

  if (shouldPrintDaemonHelp(args)) {
    printDaemonHelp();
    return;
  }

  if (daemonSubcommand === 'list') {
    try {
      const sessions = await listDaemonSessions();

      if (sessions.length === 0) {
        console.log(
          '此守护进程未感知到活跃会话（可能由守护进程旧版本启动）',
        );
      } else {
        console.log('活跃会话:');
        await writeJsonStdout(sessions, { pretty: true });
      }
    } catch {
      console.log('未运行守护进程');
    }
    return;
  }

  if (daemonSubcommand === 'stop-session') {
    const sessionId = args[2];
    if (!sessionId) {
      console.error('需要会话 ID');
      process.exit(1);
    }

    try {
      const result = await stopDaemonSession(sessionId);
      console.log(result.status === 'stopped' ? '会话已停止' : '停止会话失败');
    } catch {
      console.log('未运行守护进程');
    }
    return;
  }

  if (daemonSubcommand === 'restart-session-runners') {
    const jsonRequested = args.includes('--json');
    const dryRun = args.includes('--dry-run');
    const mode = parseDaemonSessionRunnerRestartMode(args);
    const sessionId = parseDaemonSessionIdOption(args);
    let commandResult:
      | { kind: 'bulk'; result: RestartAllDaemonSessionRunnersResult }
      | { kind: 'single'; result: RestartSessionRunnerResultV1 };

    if (sessionId === '') {
      const message = '`--session-id` 需要非空的会话 ID。';
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'missing_session_id',
          message: '`--session-id` requires a non-empty session id.',
        });
      } else {
        console.error(message);
      }
      process.exit(1);
    }

    try {
      if (sessionId) {
        commandResult = {
          kind: 'single',
          result: await requestDaemonSessionRunnerRestart({
            sessionId,
            mode,
            dryRun,
            reason: 'daemon_restart_session_runners_command',
          }),
        };
      } else {
        commandResult = {
          kind: 'bulk',
          result: await restartAllDaemonSessionRunners({
            mode,
            dryRun,
            reason: 'daemon_restart_session_runners_command',
          }),
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'session_runner_restart_failed',
          message,
        });
      } else {
        console.error(`重启会话执行器失败: ${message}`);
      }
      process.exit(1);
    }

    if (jsonRequested) {
      await printDaemonJson(commandResult.result);
    } else if (commandResult.kind === 'single') {
      printSingleSessionRunnerRestartSummary(commandResult.result, dryRun);
    } else {
      printSessionRunnerRestartSummary(commandResult.result, dryRun);
    }
    const hasFailures = commandResult.kind === 'bulk' && commandResult.result.failedCount > 0;
    process.exit(commandResult.result.ok && !hasFailures ? 0 : 1);
  }

  if (daemonSubcommand === 'start') {
    const jsonRequested = args.includes('--json');
    const ownership = await evaluateCurrentDaemonOwner();
    const takeoverRequested = args.includes('--takeover');
    const startupSource = resolveDaemonStartupSourceFromEnv(process.env);
    if (ownership.kind === 'compatible') {
      if (jsonRequested) {
        await printDaemonJson({
          ok: true,
          status: 'already_running',
          relay: configuration.serverUrl,
          relayId: configuration.activeServerId,
        });
      } else {
        console.log('守护进程已在运行');
        console.log(`  中继 URL: ${configuration.serverUrl}`);
        console.log(`  中继配置: ${configuration.activeServerId}`);
      }
      process.exit(0);
    }
    const takeoverDecision = resolveDaemonTakeoverDecision({
      ownership,
      takeoverRequested,
      startupSource,
    });

    if (takeoverDecision.kind === 'conflict') {
      const message = renderDaemonOwnerConflict({
        intent: 'daemon-start',
        owner: takeoverDecision.owner,
      });
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'owner_conflict',
          message: flattenDaemonMessage(message.title, message.lines),
        });
      } else {
        console.error(message.title);
        for (const line of message.lines) {
          console.error(`  ${line}`);
        }
      }
      process.exit(1);
    }

    if (!isDaemonStartupSourceServiceManaged(startupSource) && startupSource !== 'self-restart') {
      const startupServiceConflict = await evaluateDaemonStartupServiceConflict({
        startupSource,
        runtime: resolveDaemonServiceCliRuntimeFromEnv({ processEnv: process.env }),
      });
      if (startupServiceConflict.kind === 'installed-background-service-conflict') {
        const message = renderDaemonInstalledServiceConflict({
          action: 'daemon-start',
          services: startupServiceConflict.services,
        });
        if (jsonRequested) {
          await printDaemonJson({
            ok: false,
            error: 'installed_background_service_conflict',
            message: flattenDaemonMessage(message.title, message.lines),
          });
        } else {
          console.error(message.title);
          for (const line of message.lines) {
            console.error(line);
          }
        }
        process.exit(1);
      }
    }

    if (takeoverDecision.kind === 'manual-owner-takeover' && !jsonRequested) {
      console.error('正在接管当前手动守护进程，然后再启动新的守护进程...');
    }

    const child = await spawnDetachedDaemonStartSync(takeoverRequested
      ? {
        env: {
          ...process.env,
          HAPPIER_DAEMON_TAKEOVER: '1',
        },
      }
      : {});
    child.unref();

    const timeoutMs = readDaemonStartWaitTimeoutMs();
    const pollMs = readDaemonStartWaitPollMs();
    const started = await waitForDaemonRunningWithinBudget({
      isRunning: () => checkIfDaemonRunningAndCleanupStaleState(),
      timeoutMs,
      pollMs,
    });

    if (started) {
      let account: string | undefined;
      try {
        const creds = await readCredentials();
        const payload = creds?.token ? decodeJwtPayload(creds.token) : null;
        const sub = typeof payload?.sub === 'string' ? payload.sub : '';
        if (sub) account = sub;
      } catch {
        // ignore
      }
      if (jsonRequested) {
        await printDaemonJson({
          ok: true,
          status: 'started',
          relay: configuration.serverUrl,
          relayId: configuration.activeServerId,
          ...(account ? { account } : {}),
        });
      } else {
        console.log('守护进程启动成功');
        console.log(`  中继 URL: ${configuration.serverUrl}`);
        console.log(`  中继配置: ${configuration.activeServerId}`);
        if (account) console.log(`  账号: ${account}`);
      }
    } else {
      const inspection = await inspectDaemonRunningStateAndCleanupStaleState().catch(() => ({ status: 'not-running' as const }));
      const latestDaemonLog = await getLatestDaemonLog().catch(() => null);
      if (inspection.status === 'starting' || isChildProcessAlive(child)) {
        if (jsonRequested) {
          await printDaemonJson({
            ok: true,
            status: 'starting',
            relay: configuration.serverUrl,
            relayId: configuration.activeServerId,
            ...(latestDaemonLog?.path ? { latestDaemonLogPath: latestDaemonLog.path } : {}),
          });
        } else {
          console.log('守护进程仍在后台启动中');
          console.log(`  中继 URL: ${configuration.serverUrl}`);
          console.log(`  中继配置: ${configuration.activeServerId}`);
          if (latestDaemonLog?.path) {
            console.log(`  最新守护进程日志: ${latestDaemonLog.path}`);
          }
        }
        process.exit(0);
      }

      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'start_failed',
          message: 'Failed to start daemon',
          ...(latestDaemonLog?.path ? { latestDaemonLogPath: latestDaemonLog.path } : {}),
        });
      } else {
        console.error('启动守护进程失败');
        if (latestDaemonLog?.path) {
          console.error(`最新守护进程日志: ${latestDaemonLog.path}`);
        }
      }
      process.exit(1);
    }
    process.exit(0);
  }

  if (daemonSubcommand === 'start-sync') {
    const ownership = await evaluateCurrentDaemonOwner();
    const takeoverRequested = args.includes('--takeover');
    const startupSource = resolveDaemonStartupSourceFromEnv(process.env);
    if (ownership.kind === 'compatible' && startupSource !== 'self-restart') {
      console.log(chalk.green('守护进程已在运行'));
      console.log(`  中继 URL: ${configuration.serverUrl}`);
      console.log(`  中继配置: ${configuration.activeServerId}`);
      process.exit(0);
    }
    const takeoverDecision = resolveDaemonTakeoverDecision({
      ownership,
      takeoverRequested,
      startupSource,
    });

    if (takeoverDecision.kind === 'conflict') {
      const message = renderDaemonOwnerConflict({
        intent: 'daemon-start-sync',
        owner: takeoverDecision.owner,
      });
      console.error(message.title);
      for (const line of message.lines) {
        console.error(`  ${line}`);
      }
      process.exit(1);
    }

    if (!isDaemonStartupSourceServiceManaged(startupSource) && startupSource !== 'self-restart') {
      const startupServiceConflict = await evaluateDaemonStartupServiceConflict({
        startupSource,
        runtime: resolveDaemonServiceCliRuntimeFromEnv({ processEnv: process.env }),
      });
      if (startupServiceConflict.kind === 'installed-background-service-conflict') {
        const message = renderDaemonInstalledServiceConflict({
          action: 'daemon-start-sync',
          services: startupServiceConflict.services,
        });
        console.error(message.title);
        for (const line of message.lines) {
          console.error(line);
        }
        process.exit(1);
      }
    }

    if (takeoverDecision.kind === 'manual-owner-takeover') {
      console.error('正在接管当前手动守护进程，然后再启动新的守护进程...');
    }

    await startDaemon({ takeover: takeoverRequested });
    process.exit(0);
  }

  if (daemonSubcommand === 'stop') {
    const stopSessions = args.includes('--kill-sessions');
    if (args.includes('--all')) {
      await stopAllDaemonsBestEffort({ stopSessions });
      process.exit(0);
    }
    const ownership = await evaluateCurrentDaemonOwner();
    if (ownership.kind !== 'none' && !isManualOrLegacyManualOwner(ownership.owner.serviceManaged)) {
      const message = renderDaemonOwnerConflict({
        intent: 'daemon-stop',
        owner: ownership.owner,
      });
      console.error(message.title);
      for (const line of message.lines) {
        console.error(`  ${line}`);
      }
      process.exit(1);
    }
    await stopDaemon({ stopSessions });
    process.exit(0);
  }

  if (daemonSubcommand === 'restart') {
    const jsonRequested = args.includes('--json');
    const restartSessionRunners = args.includes('--restart-session-runners');
    const stopSessions = args.includes('--kill-sessions');
    if (restartSessionRunners && stopSessions) {
      const message = '`kaiwu daemon restart --restart-session-runners` 不能与 `--kill-sessions` 同时使用。';
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'restart_session_runners_kill_sessions_conflict',
          message,
        });
      } else {
        console.error(message);
      }
      process.exit(1);
    }
    if (args.includes('--all')) {
      const message = '暂不支持 `kaiwu daemon restart --all`。';
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'restart_all_unsupported',
          message,
        });
      } else {
        console.error(message);
      }
      process.exit(1);
    }

    const ownership = await evaluateCurrentDaemonOwner();
    const takeoverRequested = args.includes('--takeover');
    const takeoverAllowed = takeoverRequested
      && ownership.kind === 'conflict'
      && isManualOrLegacyManualOwner(ownership.owner.serviceManaged);
    if (ownership.kind === 'conflict' && !takeoverAllowed) {
      const message = renderDaemonOwnerConflict({
        intent: 'daemon-restart',
        owner: ownership.owner,
      });
      if (jsonRequested) {
        await printDaemonJson({
          ok: false,
          error: 'owner_conflict',
          message: flattenDaemonMessage(message.title, message.lines),
        });
      } else {
        console.error(message.title);
        for (const line of message.lines) {
          console.error(`  ${line}`);
        }
      }
      process.exit(1);
    }

    const startupSource = resolveDaemonStartupSourceFromEnv(process.env);
    if (!isDaemonStartupSourceServiceManaged(startupSource) && startupSource !== 'self-restart') {
      const startupServiceConflict = await evaluateDaemonStartupServiceConflict({
        startupSource,
        runtime: resolveDaemonServiceCliRuntimeFromEnv({ processEnv: process.env }),
      });
      if (startupServiceConflict.kind === 'installed-background-service-conflict') {
        const message = renderDaemonInstalledServiceConflict({
          action: 'daemon-restart',
          services: startupServiceConflict.services,
        });
        if (jsonRequested) {
          await printDaemonJson({
            ok: false,
            error: 'installed_background_service_conflict',
            message: flattenDaemonMessage(message.title, message.lines),
          });
        } else {
          console.error(message.title);
          for (const line of message.lines) {
            console.error(line);
          }
        }
        process.exit(1);
      }
    }

    if (takeoverAllowed && !jsonRequested) {
      const takeoverNotice = buildDaemonTakeoverNotice({ action: 'restart' });
      console.error(takeoverNotice.title);
      for (const line of takeoverNotice.lines) {
        console.error(`  ${line}`);
      }
    }

    const restartResult = await restartDaemonAndWait({
      stopSessions,
      takeover: takeoverRequested,
      ...(restartSessionRunners
        ? {
          restartSessionRunners: true,
          restartSessionRunnersMode: 'force_current_cli' as const,
        }
        : {}),
    });
    const started = typeof restartResult === 'boolean' ? restartResult : restartResult.ok;
    const restartStatus = typeof restartResult === 'boolean' ? undefined : restartResult.status;
    const sessionRunnerRestart = typeof restartResult === 'boolean'
      ? undefined
      : restartResult.sessionRunnerRestart;

    if (started) {
      if (restartStatus === 'starting') {
        const latestDaemonLog = await getLatestDaemonLog().catch(() => null);
        if (jsonRequested) {
          await printDaemonJson({
            ok: true,
            status: 'starting',
            relay: configuration.serverUrl,
            relayId: configuration.activeServerId,
            ...(latestDaemonLog?.path ? { latestDaemonLogPath: latestDaemonLog.path } : {}),
          });
        } else {
          console.log('守护进程仍在后台重启中');
          console.log(`  中继 URL: ${configuration.serverUrl}`);
          console.log(`  中继配置: ${configuration.activeServerId}`);
          if (latestDaemonLog?.path) {
            console.log(`  最新守护进程日志: ${latestDaemonLog.path}`);
          }
        }
        process.exit(0);
      }

      if (jsonRequested) {
        await printDaemonJson({
          ok: true,
          status: 'restarted',
          relay: configuration.serverUrl,
          relayId: configuration.activeServerId,
          ...(sessionRunnerRestart ? { sessionRunnerRestart } : {}),
        });
      } else {
        console.log('守护进程重启成功');
        console.log(`  中继 URL: ${configuration.serverUrl}`);
        console.log(`  中继配置: ${configuration.activeServerId}`);
        if (sessionRunnerRestart) {
          console.log(
            `  会话执行器: ${sessionRunnerRestart.restartedCount} 个已重启，` +
            `${sessionRunnerRestart.skippedCount} 个已跳过，${sessionRunnerRestart.failedCount} 个失败`,
          );
        }
      }
      process.exit(0);
    }

    const latestDaemonLog = sessionRunnerRestart
      ? null
      : await getLatestDaemonLog().catch(() => null);
    const failureMessage = sessionRunnerRestart
      ? 'Session runner restart failed after daemon restart'
      : 'Failed to restart daemon';
    if (jsonRequested) {
      await printDaemonJson({
        ok: false,
        error: sessionRunnerRestart ? 'session_runner_restart_failed_after_daemon_restart' : 'restart_failed',
        message: failureMessage,
        relay: configuration.serverUrl,
        relayId: configuration.activeServerId,
        ...(sessionRunnerRestart ? { sessionRunnerRestart } : {}),
        ...(latestDaemonLog?.path ? { latestDaemonLogPath: latestDaemonLog.path } : {}),
      });
    } else {
      if (sessionRunnerRestart) {
        printSessionRunnerRestartFailureAfterDaemonRestart(sessionRunnerRestart);
      } else {
        console.error('重启守护进程失败');
      }
      if (!sessionRunnerRestart && latestDaemonLog?.path) {
        console.error(`最新守护进程日志: ${latestDaemonLog.path}`);
      }
    }
    process.exit(1);
  }

  if (daemonSubcommand === 'status') {
      if (args.includes('--json')) {
      if (args.includes('--all')) {
        const statuses = await listDaemonStatusesForAllKnownServers();
        const activeRelayUrl = configuration.publicServerUrl || configuration.serverUrl;
        const activeComparableKey = (() => {
          try {
            return createServerUrlComparableKey(activeRelayUrl);
          } catch {
            return null;
          }
        })();
        await writeJsonStdout({
          active: {
            serverId: configuration.activeServerId,
            relayUrl: activeRelayUrl,
            comparableKey: activeComparableKey,
          },
          entries: statuses.map((entry) => {
            let servicePlatform = typeof entry.service.platform === 'string' ? entry.service.platform : null;
            let serviceInstalledPath = typeof entry.service.installedPath === 'string' ? entry.service.installedPath : null;
            if (!servicePlatform || !serviceInstalledPath) {
              try {
                const snapshot = resolveDaemonServiceInstallationSnapshotFromEnv({
                  processEnv: {
                    ...process.env,
                    HAPPIER_DAEMON_SERVICE_INSTANCE_ID: entry.serverId,
                    HAPPIER_DAEMON_SERVICE_SERVER_URL: entry.serverUrl,
                  },
                });
                if (!servicePlatform) servicePlatform = snapshot.platform;
                if (!serviceInstalledPath) serviceInstalledPath = snapshot.installedPath;
              } catch {
                // ignore
              }
            }

            return {
            serverId: entry.serverId,
            name: entry.name,
            serverUrl: entry.serverUrl,
            daemonStatePath: entry.daemonStatePath,
            comparableKey: entry.comparableKey,
            ...(entry.auth ? { auth: entry.auth } : {}),
            ...(entry.drift ? { drift: { ...entry.drift, activeRelayUrl: activeRelayUrl } } : {}),
            service: {
              installed: entry.service.installed,
              running: typeof entry.service.running === 'boolean'
                ? entry.service.running
                : entry.service.installed && entry.daemon.running,
              platform: servicePlatform,
              installedPath: serviceInstalledPath,
            },
            daemon: {
              installed: entry.service.installed,
              running: entry.daemon.running,
              pid: entry.daemon.pid,
              httpPort: entry.daemon.httpPort ?? null,
              staleStateFile: Boolean(entry.daemon.staleStateFile),
            },
            };
          }),
        });
        process.exit(0);
      }
      const snapshot = await readDaemonStatusSnapshot();
      await writeJsonStdout(snapshot);
      process.exit(0);
    }

    if (args.includes('--all')) {
      const statuses = await listDaemonStatusesForAllKnownServers();
      for (const entry of statuses) {
        const state = entry.daemon.running ? `运行中 (pid ${entry.daemon.pid ?? '—'})` : '未运行';
        console.log(`${entry.name} (${entry.serverId})`);
        if (entry.serverUrl) console.log(`  中继 URL: ${entry.serverUrl}`);
        console.log(`  守护进程: ${state}`);
        if (entry.daemon.staleStateFile) console.log(`  说明: 存在过期的状态文件: ${entry.daemonStatePath}`);
        console.log('');
      }
      process.exit(0);
    }
    await runDoctorCommand('daemon');
    process.exit(0);
  }

  if (daemonSubcommand === 'logs') {
    const latest = await getLatestDaemonLog();
    if (!latest) {
      console.log('未找到守护进程日志');
    } else {
      console.log(latest.path);
    }
    process.exit(0);
  }

  if (daemonSubcommand === 'install') {
    try {
      await runDaemonServiceCliCommand({ argv: ['install', ...args.slice(2)] });
    } catch (error) {
      console.error(chalk.red('错误:'), error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
    return;
  }

  if (daemonSubcommand === 'uninstall') {
    try {
      await runDaemonServiceCliCommand({ argv: ['uninstall', ...args.slice(2)] });
    } catch (error) {
      console.error(chalk.red('错误:'), error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
    return;
  }

  printDaemonHelp();
}
