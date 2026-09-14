/**
 * Doctor command implementation
 *
 * Provides comprehensive diagnostics and troubleshooting information
 * for Happier CLI including configuration, daemon status, logs, and links
 */

import chalk from 'chalk'
import { configuration } from '@/configuration'
import { readSettings, readCredentials } from '@/persistence'
import { checkIfDaemonRunningAndCleanupStaleState } from '@/daemon/controlClient'
import { findRunawayHappyProcesses, findAllHappyProcesses } from '@/daemon/doctor'
import { readDaemonState, type DaemonLocallyPersistedState } from '@/persistence'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import packageJson from '../../package.json'
import { buildDoctorSnapshot, type DoctorSnapshot } from '@/ui/doctorSnapshot'
import { formatDoctorLocalRelayLines } from '@/ui/doctorLocalRelays'
import {
    buildDoctorRuntimeDiagnostics,
    formatDoctorRuntimeLabel,
    formatDoctorSpawnPathLabel,
} from '@/ui/doctorRuntimeDiagnostics'
import {
    renderDoctorCleanupOwnershipSummary,
    type DoctorCleanupOwnershipSummary,
} from '@/ui/doctorCleanupOwnershipSummary'
import { getReleaseRingCatalogEntry } from '@happier-dev/release-runtime/releaseRings'
import { resolveDaemonStartupSourceServiceManagedState } from '@/daemon/ownership/daemonOwnershipMetadata'

export function maskValue(value: string): string;
export function maskValue(value: string | undefined): string | undefined;
export function maskValue(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (value.trim() === '') return '<empty>';

    // Treat ${VAR} templates as safe to display (they do not contain secrets themselves).
    if (/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value)) return value;

    // For templates with default values, preserve the template structure but mask the fallback.
    // Example: ${OPENAI_API_KEY:-sk-...} -> ${OPENAI_API_KEY:-<N chars>}
    const matchWithFallback = value.match(/^\$\{([A-Z_][A-Z0-9_]*)(:-|:=)(.*)\}$/);
    if (matchWithFallback) {
        const [, sourceVar, operator, fallback] = matchWithFallback;
        if (fallback === '') return `\${${sourceVar}${operator}}`;
        return `\${${sourceVar}${operator}${maskValue(fallback)}}`;
    }

    return `<${value.length} chars>`;
}

type SettingsForDisplay = Awaited<ReturnType<typeof readSettings>>;

function redactSettingsForDisplay(settings: SettingsForDisplay): SettingsForDisplay {
    const redacted = JSON.parse(JSON.stringify(settings ?? {})) as SettingsForDisplay;
    const redactedRecord = redacted as unknown as Record<string, unknown>;

    // Remove any legacy CLI-local env cache; it may contain secrets.
    if (Object.prototype.hasOwnProperty.call(redactedRecord, 'localEnvironmentVariables')) {
        delete redactedRecord.localEnvironmentVariables;
    }

    return redacted;
}

export function redactDaemonStateForDisplay(state: DaemonLocallyPersistedState): Record<string, unknown> {
    const redacted = JSON.parse(JSON.stringify(state ?? {})) as Record<string, unknown>;
    if (typeof redacted.controlToken === 'string' && redacted.controlToken.trim() !== '') {
        redacted.controlToken = '<redacted>';
    }
    return redacted;
}

export function formatDaemonOwnerLabel(state: Readonly<{
    startedWithPublicReleaseChannel?: string | null;
    startedWithCliVersion?: string | null;
    serviceManaged?: boolean | null;
    serviceLabel?: string | null;
}>): string {
    const parts = [
        state.serviceManaged === true
            ? '后台服务'
            : state.serviceManaged === false
                ? '手动启动'
                : '未知',
        typeof state.serviceLabel === 'string' && state.serviceLabel.trim() ? state.serviceLabel.trim() : null,
        typeof state.startedWithPublicReleaseChannel === 'string' && state.startedWithPublicReleaseChannel.trim()
            ? state.startedWithPublicReleaseChannel.trim()
            : null,
        typeof state.startedWithCliVersion === 'string' && state.startedWithCliVersion.trim()
            ? state.startedWithCliVersion.trim()
            : null,
    ].filter(Boolean);
    return parts.join(' • ') || '(未知)';
}

export function hasDaemonOwnerMismatchForCurrentInvocation(params: Readonly<{
    currentCliVersion: string;
    currentPublicReleaseChannel: string;
    daemonState: Readonly<{
        startedWithCliVersion?: string | null;
        startedWithPublicReleaseChannel?: string | null;
    }>;
}>): boolean {
    const versionMismatch = Boolean(
        params.currentCliVersion.trim()
        && params.daemonState.startedWithCliVersion?.trim()
        && params.currentCliVersion.trim() !== params.daemonState.startedWithCliVersion.trim(),
    );
    const releaseChannelMismatch = Boolean(
        params.currentPublicReleaseChannel.trim()
        && params.daemonState.startedWithPublicReleaseChannel?.trim()
        && params.currentPublicReleaseChannel.trim() !== params.daemonState.startedWithPublicReleaseChannel.trim(),
    );
    return versionMismatch || releaseChannelMismatch;
}

/**
 * Get relevant environment information for debugging
 */
export function getEnvironmentInfo(): Record<string, any> {
    return {
        PWD: process.env.PWD,
        HAPPIER_HOME_DIR: process.env.HAPPIER_HOME_DIR,
        HAPPIER_SERVER_URL: process.env.HAPPIER_SERVER_URL,
        HAPPIER_PROJECT_ROOT: process.env.HAPPIER_PROJECT_ROOT,
        DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING: process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING,
        NODE_ENV: process.env.NODE_ENV,
        DEBUG: process.env.DEBUG,
        workingDirectory: process.cwd(),
        processArgv: process.argv,
        happyDir: configuration?.happyHomeDir,
        serverUrl: configuration?.serverUrl,
        logsDir: configuration?.logsDir,
        processPid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        user: process.env.USER,
        home: process.env.HOME,
        shell: process.env.SHELL,
        terminal: process.env.TERM,
    };
}

function getLogFiles(logDir: string): { file: string, path: string, modified: Date }[] {
    if (!existsSync(logDir)) {
        return [];
    }

    try {
        return readdirSync(logDir)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const path = join(logDir, file);
                const stats = statSync(path);
                return { file, path, modified: stats.mtime };
            })
            .sort((a, b) => b.modified.getTime() - a.modified.getTime());
    } catch {
        return [];
    }
}

/**
 * Run doctor command specifically for daemon diagnostics
 */
export async function runDoctorDaemon(): Promise<void> {
    return runDoctorCommand('daemon');
}

export function shouldShowGlobalProcessInventory(filter: 'all' | 'daemon'): boolean {
    return filter === 'all';
}

export async function runDoctorCommand(filter?: 'all' | 'daemon'): Promise<void> {
    // Default to 'all' if no filter specified
    if (!filter) {
        filter = 'all';
    }

    let snapshot: DoctorSnapshot | null = null;
    try {
        snapshot = await buildDoctorSnapshot();
    } catch {
        snapshot = null;
    }

    console.log(chalk.bold.cyan('\n🩺 Kaiwu CLI 诊断 (Doctor)\n'));

    // For 'all' filter, show everything. For 'daemon', only show daemon-related info
    if (filter === 'all') {
        let cleanupOwnershipSummary: ReturnType<typeof renderDoctorCleanupOwnershipSummary> | null = null;

        // Version and basic info
        console.log(chalk.bold('📋 基本信息'));
        console.log(`Kaiwu CLI 版本: ${chalk.green(packageJson.version)}`);
        console.log(`平台架构: ${chalk.green(process.platform)} ${process.arch}`);
        const runtimeDiagnostics = buildDoctorRuntimeDiagnostics();
        console.log(`运行环境: ${chalk.green(formatDoctorRuntimeLabel(runtimeDiagnostics))}`);
        if (runtimeDiagnostics.runtime !== 'node' && runtimeDiagnostics.nodeCompatibilityVersion) {
            console.log(`Node 兼容版本: ${chalk.green(runtimeDiagnostics.nodeCompatibilityVersion)}`);
        }
        console.log('');

        // Daemon spawn diagnostics
        console.log(chalk.bold('🔧 守护进程生成诊断'));
        console.log(`项目根目录: ${chalk.blue(runtimeDiagnostics.projectRoot)}`);
        console.log(`包装脚本: ${chalk.blue(formatDoctorSpawnPathLabel(runtimeDiagnostics.wrapperPath))}`);
        console.log(`CLI 入口点: ${chalk.blue(formatDoctorSpawnPathLabel(runtimeDiagnostics.cliEntrypointPath))}`);
        if (runtimeDiagnostics.wrapperExists !== null) {
            console.log(`包装脚本存在: ${runtimeDiagnostics.wrapperExists ? chalk.green('✓ 是') : chalk.red('❌ 否')}`);
        }
        if (runtimeDiagnostics.cliEntrypointExists !== null) {
            console.log(`CLI 入口存在: ${runtimeDiagnostics.cliEntrypointExists ? chalk.green('✓ 是') : chalk.red('❌ 否')}`);
        }
        console.log('');

        // Configuration
        console.log(chalk.bold('⚙️  配置信息'));
        console.log(`Kaiwu 主目录: ${chalk.blue(configuration.happyHomeDir)}`);
        console.log(`中继服务 URL: ${chalk.blue(configuration.serverUrl)}`);
        console.log(`日志目录: ${chalk.blue(configuration.logsDir)}`);

        // Environment
        console.log(chalk.bold('\n🌍 环境变量'));
        const env = getEnvironmentInfo();
        console.log(`HAPPIER_HOME_DIR: ${env.HAPPIER_HOME_DIR ? chalk.green(env.HAPPIER_HOME_DIR) : chalk.gray('未设置')}`);
        console.log(`HAPPIER_SERVER_URL: ${env.HAPPIER_SERVER_URL ? chalk.green(env.HAPPIER_SERVER_URL) : chalk.gray('未设置')}`);
        console.log(`DANGEROUSLY_LOG_TO_SERVER: ${env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING ? chalk.yellow('已启用') : chalk.gray('未设置')}`);
        console.log(`DEBUG: ${env.DEBUG ? chalk.green(env.DEBUG) : chalk.gray('未设置')}`);
        console.log(`NODE_ENV: ${env.NODE_ENV ? chalk.green(env.NODE_ENV) : chalk.gray('未设置')}`);

        // Connections summary (relay/account/relay profiles)
        if (snapshot) {
            console.log(chalk.bold('\n🧭 连接状态'));
            console.log(`已解析中继配置文件 ID: ${chalk.green(snapshot.server.activeServerId)}`);
            console.log(`已解析中继 URL: ${chalk.blue(snapshot.server.serverUrl)}`);
            if (snapshot.accountId) {
                console.log(`账号: ${chalk.green(snapshot.accountId)}`);
            } else {
                console.log(`账号: ${chalk.gray('(未知)')}`);
            }

            const settingsActive = snapshot.settings.activeServerId;
            if (settingsActive && settingsActive !== snapshot.server.activeServerId) {
                console.log(chalk.yellow(`⚠️  settings.json 中的 activeServerId (${settingsActive}) 与已解析的中继配置文件 ID (${snapshot.server.activeServerId}) 不一致`));
            }

            if (snapshot.settings.servers.length > 0) {
                console.log('已配置的中继配置文件:');
                for (const server of snapshot.settings.servers.slice(0, 12)) {
                    console.log(`  - ${server.name} (${server.id}) → ${server.serverUrl}`);
                }
                if (snapshot.settings.servers.length > 12) {
                    console.log(`  … 以及另外 ${snapshot.settings.servers.length - 12} 项`);
                }
            } else {
                console.log(`已配置的中继配置文件: ${chalk.gray('(无)')}`);
            }

            const localRelays = snapshot.relays?.happier?.relays ?? [];
            const currentCliReleaseChannel = configuration.publicReleaseRing === 'publicdev'
                ? 'dev'
                : configuration.publicReleaseRing;
            for (const line of formatDoctorLocalRelayLines(localRelays, {
                currentCliReleaseChannel: currentCliReleaseChannel === 'stable'
                    || currentCliReleaseChannel === 'preview'
                    || currentCliReleaseChannel === 'dev'
                    ? currentCliReleaseChannel
                    : null,
            })) {
                console.log(line);
            }
        }

        // Settings
        try {
            const settings = await readSettings();
            console.log(chalk.bold('\n📄 设置 (settings.json):'));
            console.log(chalk.gray(JSON.stringify(redactSettingsForDisplay(settings), null, 2)));
        } catch (error) {
            console.log(chalk.bold('\n📄 设置:'));
            console.log(chalk.red('❌ 读取设置失败'));
        }

        // Authentication status
        console.log(chalk.bold('\n🔐 身份认证'));
        try {
            const credentials = await readCredentials();
            if (credentials) {
                console.log(chalk.green('✓ 已认证（已找到凭据）'));
                if (snapshot?.accountId) {
                    console.log(`  账号: ${chalk.green(snapshot.accountId)}`);
                }
            } else {
                console.log(chalk.yellow('⚠️  未认证（未找到凭据）'));
            }
        } catch (error) {
            console.log(chalk.red('❌ 读取凭据出错'));
        }
    }

    // Daemon status - shown for both 'all' and 'daemon' filters
    console.log(chalk.bold('\n🤖 守护进程状态'));
    let cleanupOwnershipSummary: DoctorCleanupOwnershipSummary | null = null;
    let cleanupOwnershipSummarySource: Readonly<{
        ownerLabel: string;
        serviceManaged: boolean | null;
    }> | null = null;
    try {
        const snapshotDaemonStatus = snapshot?.daemonStatus;

        if (snapshotDaemonStatus) {
            const daemon = snapshotDaemonStatus.daemon;
            const serviceManaged = daemon.serviceManaged ?? null;
            const ownerLabel = formatDaemonOwnerLabel({
                startedWithPublicReleaseChannel: daemon.startedWithPublicReleaseChannel ?? null,
                startedWithCliVersion: daemon.startedWithCliVersion ?? null,
                serviceManaged,
                serviceLabel: daemon.serviceLabel ?? null,
            });

            if (daemon.running) {
                console.log(chalk.green('✓ 守护进程正在运行'));
                if (daemon.pid) {
                    console.log(`  PID: ${daemon.pid}`);
                }
                if (daemon.startedWithCliVersion) {
                    console.log(`  CLI 版本: ${daemon.startedWithCliVersion}`);
                }
                console.log(`  当前状态: ${ownerLabel}`);
                if (daemon.httpPort) {
                    console.log(`  HTTP 端口: ${daemon.httpPort}`);
                }
                if (hasDaemonOwnerMismatchForCurrentInvocation({
                    currentCliVersion: packageJson.version,
                    currentPublicReleaseChannel: getReleaseRingCatalogEntry(configuration.publicReleaseRing).publicLabel,
                    daemonState: daemon,
                })) {
                    console.log(chalk.yellow('  警告: 当前 CLI 与正在运行的守护进程版本不一致。'));
                    console.log(chalk.gray(
                        serviceManaged === true
                            ? '  若希望开机自启切换到此安装，请使用 `kaiwu doctor repair`。'
                            : serviceManaged === false
                                ? '  若希望手动启动切换到此安装，请使用 `kaiwu daemon restart`。'
                                : '  在尝试切换到此安装前，请先重启正在运行的守护进程。',
                    ));
                }
                cleanupOwnershipSummarySource = {
                    ownerLabel,
                    serviceManaged,
                };
            } else {
                console.log(chalk.red('❌ 守护进程未运行'));
            }
        } else {
            const isRunning = await checkIfDaemonRunningAndCleanupStaleState();
            const state = await readDaemonState();

            if (isRunning && state) {
            console.log(chalk.green('✓ 守护进程正在运行'));
            console.log(`  PID: ${state.pid}`);
            console.log(`  启动时间: ${new Date(state.startedAt).toLocaleString()}`);
            console.log(`  CLI 版本: ${state.startedWithCliVersion}`);
            console.log(`  当前状态: ${formatDaemonOwnerLabel({
                startedWithPublicReleaseChannel: state.startedWithPublicReleaseChannel ?? null,
                startedWithCliVersion: state.startedWithCliVersion ?? null,
                serviceManaged: resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel),
                serviceLabel: state.serviceLabel ?? null,
            })}`);
            if (state.httpPort) {
                console.log(`  HTTP 端口: ${state.httpPort}`);
            }
            if (hasDaemonOwnerMismatchForCurrentInvocation({
                currentCliVersion: packageJson.version,
                currentPublicReleaseChannel: getReleaseRingCatalogEntry(configuration.publicReleaseRing).publicLabel,
                daemonState: state,
            })) {
                console.log(chalk.yellow('  警告: 当前 CLI 与正在运行的守护进程版本不一致。'));
                console.log(chalk.gray(
                    resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel) === true
                        ? '  若希望开机自启切换到此安装，请使用 `kaiwu doctor repair`。'
                        : resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel) === false
                            ? '  若希望手动启动切换到此安装，请使用 `kaiwu daemon restart`。'
                            : '  在尝试切换到此安装前，请先重启正在运行的守护进程。',
                ));
            }
            cleanupOwnershipSummarySource = {
                ownerLabel: formatDaemonOwnerLabel({
                    startedWithPublicReleaseChannel: state.startedWithPublicReleaseChannel ?? null,
                    startedWithCliVersion: state.startedWithCliVersion ?? null,
                    serviceManaged: resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel),
                    serviceLabel: state.serviceLabel ?? null,
                }),
                serviceManaged: resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel),
            };
            } else if (state && !isRunning) {
                console.log(chalk.yellow('⚠️  存在守护进程状态文件但进程未运行（状态残留）'));
            } else {
                console.log(chalk.red('❌ 守护进程未运行'));
            }

            // Show daemon state file
            if (state) {
                console.log(chalk.bold('\n📄 守护进程状态:'));
                console.log(chalk.blue(`位置: ${configuration.daemonStateFile}`));
                console.log(chalk.gray(JSON.stringify(redactDaemonStateForDisplay(state), null, 2)));
            }
        }

        if (shouldShowGlobalProcessInventory(filter)) {
            // All Happier processes
            const allProcesses = await findAllHappyProcesses();
            if (allProcesses.length > 0) {
                console.log(chalk.bold('\n🔍 所有 Kaiwu CLI 进程'));

                // Group by type
                const grouped = allProcesses.reduce((groups, process) => {
                    if (!groups[process.type]) groups[process.type] = [];
                    groups[process.type].push(process);
                    return groups;
                }, {} as Record<string, typeof allProcesses>);

                // Display each group
                Object.entries(grouped).forEach(([type, processes]) => {
                    const typeLabels: Record<string, string> = {
                        'current': '📍 当前进程',
                        'daemon': '🤖 守护进程',
                        'daemon-version-check': '🔍 守护进程版本检查（卡住）',
                        'daemon-spawned-session': '🔗 守护进程生成的会话',
                        'user-session': '👤 用户会话',
                        'dev-daemon': '🛠️  开发版守护进程',
                        'dev-daemon-version-check': '🛠️  开发版守护进程版本检查（卡住）',
                        'dev-session': '🛠️  开发版会话',
                        'dev-doctor': '🛠️  开发版诊断',
                        'dev-related': '🛠️  开发版相关进程',
                        'doctor': '🩺 诊断进程',
                        'unknown': '❓ 未知'
                    };

                    console.log(chalk.blue(`\n${typeLabels[type] || type}:`));
                    processes.forEach(({ pid, command }) => {
                        const color = type === 'current' ? chalk.green :
                            type.startsWith('dev') ? chalk.cyan :
                                type.includes('daemon') ? chalk.blue : chalk.gray;
                        console.log(`  ${color(`PID ${pid}`)}: ${chalk.gray(command)}`);
                    });
                });
            } else {
                console.log(chalk.red('❌ 未找到 Kaiwu 进程'));
            }

            if (allProcesses.length > 1) { // More than just current process
                console.log(chalk.bold('\n💡 进程管理'));
                console.log(chalk.gray('清理失控进程: kaiwu doctor clean'));
            }

            const cleanupSummary = cleanupOwnershipSummary;
            if (cleanupSummary !== null) {
                const renderedCleanupSummary = cleanupSummary as DoctorCleanupOwnershipSummary;
                console.log(chalk.bold(`\n🧹 ${renderedCleanupSummary.title}`));
                renderedCleanupSummary.lines.forEach((line: string, index: number) => {
                    console.log(index === 0 ? line : chalk.gray(line));
                });
            }
        }
    } catch (error) {
        console.log(chalk.red('❌ 检查守护进程状态时出错'));
    }

    if (filter === 'all' && cleanupOwnershipSummarySource) {
        cleanupOwnershipSummary = renderDoctorCleanupOwnershipSummary(cleanupOwnershipSummarySource);
        const summary = cleanupOwnershipSummary;
        if (summary !== null) {
            console.log(chalk.bold(`\n🧹 ${summary.title}`));
            summary.lines.forEach((line, index) => {
                console.log(index === 0 ? line : chalk.gray(line));
            });
        }
    }

    // Log files - only show for 'all' filter
    if (filter === 'all') {
        console.log(chalk.bold('\n📝 日志文件'));

        // Get ALL log files
        const allLogs = getLogFiles(configuration.logsDir);

        if (allLogs.length > 0) {
            // Separate daemon and regular logs
            const daemonLogs = allLogs.filter(({ file }) => file.includes('daemon'));
            const regularLogs = allLogs.filter(({ file }) => !file.includes('daemon'));

            // Show regular logs (max 10)
            if (regularLogs.length > 0) {
                console.log(chalk.blue('\n最近日志:'));
                const logsToShow = regularLogs.slice(0, 10);
                logsToShow.forEach(({ file, path, modified }) => {
                    console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
                    console.log(chalk.gray(`    ${path}`));
                });
                if (regularLogs.length > 10) {
                    console.log(chalk.gray(`  ... 以及另外 ${regularLogs.length - 10} 个日志文件`));
                }
            }

            // Show daemon logs (max 5)
            if (daemonLogs.length > 0) {
                console.log(chalk.blue('\n守护进程日志:'));
                const daemonLogsToShow = daemonLogs.slice(0, 5);
                daemonLogsToShow.forEach(({ file, path, modified }) => {
                    console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
                    console.log(chalk.gray(`    ${path}`));
                });
                if (daemonLogs.length > 5) {
                    console.log(chalk.gray(`  ... 以及另外 ${daemonLogs.length - 5} 个守护进程日志文件`));
                }
            } else {
                console.log(chalk.yellow('\n未找到守护进程日志文件'));
            }
        } else {
            console.log(chalk.yellow('未找到日志文件'));
        }

        // Support and bug reports
        console.log(chalk.bold('\n🐛 支持与问题反馈'));
        console.log(`反馈问题: ${chalk.blue('https://github.com/wuji-labs/kaiwu/issues')}`);
        console.log(`文档地址: ${chalk.blue('https://kaiwu.chengqiyun.com/docs')}`);
    }

    console.log(chalk.green('\n✅ Doctor 诊断完成！\n'));
}
