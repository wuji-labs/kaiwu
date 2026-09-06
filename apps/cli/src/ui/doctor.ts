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
            ? 'background service'
            : state.serviceManaged === false
                ? 'manual start'
                : 'unknown',
        typeof state.serviceLabel === 'string' && state.serviceLabel.trim() ? state.serviceLabel.trim() : null,
        typeof state.startedWithPublicReleaseChannel === 'string' && state.startedWithPublicReleaseChannel.trim()
            ? state.startedWithPublicReleaseChannel.trim()
            : null,
        typeof state.startedWithCliVersion === 'string' && state.startedWithCliVersion.trim()
            ? state.startedWithCliVersion.trim()
            : null,
    ].filter(Boolean);
    return parts.join(' • ') || '(unknown)';
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
    
    console.log(chalk.bold.cyan('\n🩺 Kaiwu CLI Doctor\n'));

    // For 'all' filter, show everything. For 'daemon', only show daemon-related info
    if (filter === 'all') {
        let cleanupOwnershipSummary: ReturnType<typeof renderDoctorCleanupOwnershipSummary> | null = null;

        // Version and basic info
        console.log(chalk.bold('📋 Basic Information'));
        console.log(`Kaiwu CLI Version: ${chalk.green(packageJson.version)}`);
        console.log(`Platform: ${chalk.green(process.platform)} ${process.arch}`);
        const runtimeDiagnostics = buildDoctorRuntimeDiagnostics();
        console.log(`Runtime: ${chalk.green(formatDoctorRuntimeLabel(runtimeDiagnostics))}`);
        if (runtimeDiagnostics.runtime !== 'node' && runtimeDiagnostics.nodeCompatibilityVersion) {
            console.log(`Node compatibility: ${chalk.green(runtimeDiagnostics.nodeCompatibilityVersion)}`);
        }
        console.log('');

        // Daemon spawn diagnostics
        console.log(chalk.bold('🔧 Daemon Spawn Diagnostics'));
        console.log(`Project Root: ${chalk.blue(runtimeDiagnostics.projectRoot)}`);
        console.log(`Wrapper Script: ${chalk.blue(formatDoctorSpawnPathLabel(runtimeDiagnostics.wrapperPath))}`);
        console.log(`CLI Entrypoint: ${chalk.blue(formatDoctorSpawnPathLabel(runtimeDiagnostics.cliEntrypointPath))}`);
        if (runtimeDiagnostics.wrapperExists !== null) {
            console.log(`Wrapper Exists: ${runtimeDiagnostics.wrapperExists ? chalk.green('✓ Yes') : chalk.red('❌ No')}`);
        }
        if (runtimeDiagnostics.cliEntrypointExists !== null) {
            console.log(`CLI Exists: ${runtimeDiagnostics.cliEntrypointExists ? chalk.green('✓ Yes') : chalk.red('❌ No')}`);
        }
        console.log('');

		        // Configuration
		        console.log(chalk.bold('⚙️  Configuration'));
		        console.log(`Kaiwu Home: ${chalk.blue(configuration.happyHomeDir)}`);
		        console.log(`Relay URL: ${chalk.blue(configuration.serverUrl)}`);
		        console.log(`Logs Dir: ${chalk.blue(configuration.logsDir)}`);

        // Environment
        console.log(chalk.bold('\n🌍 Environment Variables'));
        const env = getEnvironmentInfo();
        console.log(`HAPPIER_HOME_DIR: ${env.HAPPIER_HOME_DIR ? chalk.green(env.HAPPIER_HOME_DIR) : chalk.gray('not set')}`);
        console.log(`HAPPIER_SERVER_URL: ${env.HAPPIER_SERVER_URL ? chalk.green(env.HAPPIER_SERVER_URL) : chalk.gray('not set')}`);
        console.log(`DANGEROUSLY_LOG_TO_SERVER: ${env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING ? chalk.yellow('ENABLED') : chalk.gray('not set')}`);
        console.log(`DEBUG: ${env.DEBUG ? chalk.green(env.DEBUG) : chalk.gray('not set')}`);
        console.log(`NODE_ENV: ${env.NODE_ENV ? chalk.green(env.NODE_ENV) : chalk.gray('not set')}`);

		        // Connections summary (relay/account/relay profiles)
		        if (snapshot) {
		            console.log(chalk.bold('\n🧭 Connections'));
		            console.log(`Resolved relay profile ID: ${chalk.green(snapshot.server.activeServerId)}`);
		            console.log(`Resolved relay URL: ${chalk.blue(snapshot.server.serverUrl)}`);
	            if (snapshot.accountId) {
	                console.log(`Account: ${chalk.green(snapshot.accountId)}`);
	            } else {
	                console.log(`Account: ${chalk.gray('(unknown)')}`);
	            }

		            const settingsActive = snapshot.settings.activeServerId;
		            if (settingsActive && settingsActive !== snapshot.server.activeServerId) {
		                console.log(chalk.yellow(`⚠️  settings.json activeServerId (${settingsActive}) differs from resolved relay profile ID (${snapshot.server.activeServerId})`));
		            }

		            if (snapshot.settings.servers.length > 0) {
		                console.log('Configured relay profiles:');
		                for (const server of snapshot.settings.servers.slice(0, 12)) {
		                    console.log(`  - ${server.name} (${server.id}) → ${server.serverUrl}`);
		                }
		                if (snapshot.settings.servers.length > 12) {
		                    console.log(`  … and ${snapshot.settings.servers.length - 12} more`);
		                }
		            } else {
		                console.log(`Configured relay profiles: ${chalk.gray('(none)')}`);
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
            console.log(chalk.bold('\n📄 Settings (settings.json):'));
            console.log(chalk.gray(JSON.stringify(redactSettingsForDisplay(settings), null, 2)));
        } catch (error) {
            console.log(chalk.bold('\n📄 Settings:'));
            console.log(chalk.red('❌ Failed to read settings'));
        }

        // Authentication status
        console.log(chalk.bold('\n🔐 Authentication'));
        try {
            const credentials = await readCredentials();
            if (credentials) {
                console.log(chalk.green('✓ Authenticated (credentials found)'));
                if (snapshot?.accountId) {
                    console.log(`  Account: ${chalk.green(snapshot.accountId)}`);
                }
            } else {
                console.log(chalk.yellow('⚠️  Not authenticated (no credentials)'));
            }
        } catch (error) {
            console.log(chalk.red('❌ Error reading credentials'));
        }
    }

    // Daemon status - shown for both 'all' and 'daemon' filters
    console.log(chalk.bold('\n🤖 Daemon Status'));
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
                console.log(chalk.green('✓ Daemon is running'));
                if (daemon.pid) {
                    console.log(`  PID: ${daemon.pid}`);
                }
                if (daemon.startedWithCliVersion) {
                    console.log(`  CLI Version: ${daemon.startedWithCliVersion}`);
                }
                console.log(`  Current status: ${ownerLabel}`);
                if (daemon.httpPort) {
                    console.log(`  HTTP Port: ${daemon.httpPort}`);
                }
                if (hasDaemonOwnerMismatchForCurrentInvocation({
                    currentCliVersion: packageJson.version,
                    currentPublicReleaseChannel: getReleaseRingCatalogEntry(configuration.publicReleaseRing).publicLabel,
                    daemonState: daemon,
                })) {
                    console.log(chalk.yellow('  Warning: Current CLI differs from the running daemon.'));
                    console.log(chalk.gray(
                        serviceManaged === true
                            ? '  Use `happier doctor repair` if you want automatic startup to switch to this installation.'
                            : serviceManaged === false
                                ? '  Use `happier daemon restart` if you want the manual start to switch to this installation.'
                                : '  Restart the running daemon before trying to switch this installation.',
                    ));
                }
                cleanupOwnershipSummarySource = {
                    ownerLabel,
                    serviceManaged,
                };
            } else {
                console.log(chalk.red('❌ Daemon is not running'));
            }
        } else {
            const isRunning = await checkIfDaemonRunningAndCleanupStaleState();
            const state = await readDaemonState();

            if (isRunning && state) {
            console.log(chalk.green('✓ Daemon is running'));
            console.log(`  PID: ${state.pid}`);
            console.log(`  Started: ${new Date(state.startedAt).toLocaleString()}`);
            console.log(`  CLI Version: ${state.startedWithCliVersion}`);
            console.log(`  Current status: ${formatDaemonOwnerLabel({
                startedWithPublicReleaseChannel: state.startedWithPublicReleaseChannel ?? null,
                startedWithCliVersion: state.startedWithCliVersion ?? null,
                serviceManaged: resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel),
                serviceLabel: state.serviceLabel ?? null,
            })}`);
            if (state.httpPort) {
                console.log(`  HTTP Port: ${state.httpPort}`);
            }
            if (hasDaemonOwnerMismatchForCurrentInvocation({
                currentCliVersion: packageJson.version,
                currentPublicReleaseChannel: getReleaseRingCatalogEntry(configuration.publicReleaseRing).publicLabel,
                daemonState: state,
            })) {
                console.log(chalk.yellow('  Warning: Current CLI differs from the running daemon.'));
                console.log(chalk.gray(
                    resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel) === true
                        ? '  Use `happier doctor repair` if you want automatic startup to switch to this installation.'
                        : resolveDaemonStartupSourceServiceManagedState(state.startupSource, state.serviceLabel) === false
                            ? '  Use `happier daemon restart` if you want the manual start to switch to this installation.'
                            : '  Restart the running daemon before trying to switch this installation.',
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
                console.log(chalk.yellow('⚠️  Daemon state exists but process not running (stale)'));
            } else {
                console.log(chalk.red('❌ Daemon is not running'));
            }

            // Show daemon state file
            if (state) {
                console.log(chalk.bold('\n📄 Daemon State:'));
                console.log(chalk.blue(`Location: ${configuration.daemonStateFile}`));
                console.log(chalk.gray(JSON.stringify(redactDaemonStateForDisplay(state), null, 2)));
            }
        }

        if (shouldShowGlobalProcessInventory(filter)) {
            // All Happier processes
            const allProcesses = await findAllHappyProcesses();
            if (allProcesses.length > 0) {
                console.log(chalk.bold('\n🔍 All Kaiwu CLI Processes'));

                // Group by type
                const grouped = allProcesses.reduce((groups, process) => {
                    if (!groups[process.type]) groups[process.type] = [];
                    groups[process.type].push(process);
                    return groups;
                }, {} as Record<string, typeof allProcesses>);

                // Display each group
                Object.entries(grouped).forEach(([type, processes]) => {
                    const typeLabels: Record<string, string> = {
                        'current': '📍 Current Process',
                        'daemon': '🤖 Daemon',
                        'daemon-version-check': '🔍 Daemon Version Check (stuck)',
                        'daemon-spawned-session': '🔗 Daemon-Spawned Sessions',
                        'user-session': '👤 User Sessions',
                        'dev-daemon': '🛠️  Dev Daemon',
                        'dev-daemon-version-check': '🛠️  Dev Daemon Version Check (stuck)',
                        'dev-session': '🛠️  Dev Sessions',
                        'dev-doctor': '🛠️  Dev Doctor',
                        'dev-related': '🛠️  Dev Related',
                        'doctor': '🩺 Doctor',
                        'unknown': '❓ Unknown'
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
                console.log(chalk.red('❌ No happier processes found'));
            }

            if (allProcesses.length > 1) { // More than just current process
                console.log(chalk.bold('\n💡 Process Management'));
                console.log(chalk.gray('To clean up runaway processes: happier doctor clean'));
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
        console.log(chalk.red('❌ Error checking daemon status'));
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
        console.log(chalk.bold('\n📝 Log Files'));

        // Get ALL log files
        const allLogs = getLogFiles(configuration.logsDir);
        
        if (allLogs.length > 0) {
            // Separate daemon and regular logs
            const daemonLogs = allLogs.filter(({ file }) => file.includes('daemon'));
            const regularLogs = allLogs.filter(({ file }) => !file.includes('daemon'));

            // Show regular logs (max 10)
            if (regularLogs.length > 0) {
                console.log(chalk.blue('\nRecent Logs:'));
                const logsToShow = regularLogs.slice(0, 10);
                logsToShow.forEach(({ file, path, modified }) => {
                    console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
                    console.log(chalk.gray(`    ${path}`));
                });
                if (regularLogs.length > 10) {
                    console.log(chalk.gray(`  ... and ${regularLogs.length - 10} more log files`));
                }
            }

            // Show daemon logs (max 5)
            if (daemonLogs.length > 0) {
                console.log(chalk.blue('\nDaemon Logs:'));
                const daemonLogsToShow = daemonLogs.slice(0, 5);
                daemonLogsToShow.forEach(({ file, path, modified }) => {
                    console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
                    console.log(chalk.gray(`    ${path}`));
                });
                if (daemonLogs.length > 5) {
                    console.log(chalk.gray(`  ... and ${daemonLogs.length - 5} more daemon log files`));
                }
            } else {
                console.log(chalk.yellow('\nNo daemon log files found'));
            }
        } else {
            console.log(chalk.yellow('No log files found'));
        }

        // Support and bug reports
        console.log(chalk.bold('\n🐛 Support & Bug Reports'));
        console.log(`Report issues: ${chalk.blue('https://github.com/happier-dev/happier/issues')}`);
        console.log(`Documentation: ${chalk.blue('https://app.happier.dev')}`);
    }

    console.log(chalk.green('\n✅ Doctor diagnosis complete!\n'));
}
