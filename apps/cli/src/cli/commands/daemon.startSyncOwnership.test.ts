import { afterEach, describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderSystemdServiceUnit } from '@happier-dev/cli-common/service';

import type { DaemonRunningInspection } from '@/daemon/controlClient';
import type { DaemonServiceListEntry } from '@/daemon/service/cli';
import { resolveDaemonServiceCliRuntimeFromEnv, resolveDaemonServicePaths } from '@/daemon/service/cli';
import { withTempDir } from '@/testkit/fs/tempDir';
import { createEnvKeyScope } from '@/testkit/env/envScope';

type DaemonStartupServiceConflictEvaluation =
    | Readonly<{ kind: 'none' }>
    | Readonly<{ kind: 'installed-background-service-conflict'; services: readonly DaemonServiceListEntry[] }>;

const { inspectDaemonMock, startDaemonMock, evaluateDaemonStartupServiceConflictMock } = vi.hoisted(() => ({
    inspectDaemonMock: vi.fn<() => Promise<DaemonRunningInspection>>(async () => ({ status: 'not-running' })),
    startDaemonMock: vi.fn(async () => {}),
    evaluateDaemonStartupServiceConflictMock: vi.fn<() => Promise<DaemonStartupServiceConflictEvaluation>>(async () => ({ kind: 'none' })),
}));

vi.mock('@/daemon/controlClient', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/daemon/controlClient')>();
    return {
        ...actual,
        inspectDaemonRunningStateAndCleanupStaleState: inspectDaemonMock,
    };
});

vi.mock('@/daemon/startDaemon', () => ({
    startDaemon: startDaemonMock,
}));

vi.mock('@/daemon/ownership/daemonServiceInventory', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/daemon/ownership/daemonServiceInventory')>();
    return {
        ...actual,
        evaluateDaemonStartupServiceConflict: evaluateDaemonStartupServiceConflictMock,
    };
});

describe('handleDaemonCliCommand: daemon start-sync', () => {
    const envScope = createEnvKeyScope([
        'HAPPIER_HOME_DIR',
        'HAPPIER_ACTIVE_SERVER_ID',
        'HAPPIER_PUBLIC_RELEASE_CHANNEL',
        'HAPPIER_DAEMON_STARTUP_SOURCE',
        'HAPPIER_DAEMON_SERVICE_PLATFORM',
        'HAPPIER_DAEMON_SERVICE_USER_HOME_DIR',
        'HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR',
        'HAPPIER_DAEMON_SERVICE_CHANNEL',
        'HAPPIER_SERVER_URL',
        'HAPPIER_PUBLIC_SERVER_URL',
        'HAPPIER_WEBAPP_URL',
    ]);

    afterEach(() => {
        envScope.restore();
        inspectDaemonMock.mockReset();
        inspectDaemonMock.mockImplementation(async () => ({ status: 'not-running' }));
        startDaemonMock.mockReset();
        evaluateDaemonStartupServiceConflictMock.mockReset();
        evaluateDaemonStartupServiceConflictMock.mockImplementation(async () => ({ kind: 'none' as const }));
        vi.restoreAllMocks();
        vi.doUnmock('@/daemon/ownership/evaluateCurrentDaemonOwner');
        vi.unmock('@/daemon/ownership/evaluateCurrentDaemonOwner');
        vi.resetModules();
    });

    it('fails closed when a different daemon is already running for the selected relay', async () => {
        envScope.patch({
            HAPPIER_DAEMON_STARTUP_SOURCE: 'manual',
            HAPPIER_SERVER_URL: 'https://cloud.example.test',
            HAPPIER_PUBLIC_SERVER_URL: 'https://cloud.example.test',
            HAPPIER_WEBAPP_URL: 'https://cloud.example.test',
        });

        const conflictInspection: DaemonRunningInspection = {
            status: 'running',
            state: {
                pid: process.pid,
                httpPort: 43110,
                startedAt: Date.now(),
                startedWithCliVersion: '0.0.0-other',
                startedWithPublicReleaseChannel: 'preview',
                startupSource: 'background-service',
                serviceLabel: 'com.happier.cli.daemon.default',
            },
        };
        inspectDaemonMock.mockResolvedValue(conflictInspection);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code ?? ''}`);
        }) as never);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();
        vi.doMock('@/daemon/ownership/evaluateCurrentDaemonOwner', () => ({
            evaluateCurrentDaemonOwner: vi.fn(async () => ({
                kind: 'conflict' as const,
                owner: {
                    status: 'running' as const,
                    state: conflictInspection.state,
                    currentCliVersion: '0.2.8',
                    currentPublicReleaseChannel: 'stable' as const,
                    versionMatches: false,
                    releaseChannelMatches: false,
                    serviceManaged: true,
                    startupSource: 'background-service' as const,
                },
            })),
        }));
        const { handleDaemonCliCommand } = await import('./daemon');

        await expect(handleDaemonCliCommand({
            args: ['daemon', 'start-sync'],
        } as never)).rejects.toThrow(/exit:1/);

        expect(startDaemonMock).not.toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(errorSpy.mock.calls.flat().join(' ')).toContain('already running for the selected relay');
    });

    it('allows a stale manually started daemon to be replaced without requiring takeover', async () => {
        const conflictInspection: DaemonRunningInspection = {
            status: 'running',
            state: {
                pid: process.pid,
                httpPort: 43112,
                startedAt: Date.now(),
                startedWithCliVersion: '0.0.0-other',
                startedWithPublicReleaseChannel: 'stable',
                startupSource: 'manual',
                runtimeId: 'runtime-stale-manual',
            },
        };
        inspectDaemonMock.mockResolvedValue(conflictInspection);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code ?? ''}`);
        }) as never);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();
        const { handleDaemonCliCommand } = await import('./daemon');

        try {
            await expect(handleDaemonCliCommand({
                args: ['daemon', 'start-sync'],
            } as never)).rejects.toThrow(/exit:0/);
        } finally {
            exitSpy.mockRestore();
            errorSpy.mockRestore();
        }

        expect(startDaemonMock).toHaveBeenCalledWith({ takeover: false });
    });

    it('does not short-circuit a self-restart replacement when the current daemon is compatible', async () => {
        envScope.patch({
            HAPPIER_DAEMON_STARTUP_SOURCE: 'self-restart',
            HAPPIER_DAEMON_RUNTIME_ID: 'runtime-compatible',
        });
        const compatibleInspection: DaemonRunningInspection = {
            status: 'running',
            state: {
                pid: process.pid,
                httpPort: 43113,
                startedAt: Date.now(),
                startedWithCliVersion: '0.2.8',
                startedWithPublicReleaseChannel: 'stable',
                startupSource: 'manual',
                runtimeId: 'runtime-compatible',
            },
        };

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code ?? ''}`);
        }) as never);
        vi.resetModules();
        vi.doMock('@/daemon/ownership/evaluateCurrentDaemonOwner', () => ({
            evaluateCurrentDaemonOwner: vi.fn(async () => ({
                kind: 'compatible' as const,
                owner: {
                    status: 'running' as const,
                    state: compatibleInspection.state,
                    currentCliVersion: '0.2.8',
                    currentPublicReleaseChannel: 'stable' as const,
                    versionMatches: true,
                    releaseChannelMatches: true,
                    serviceManaged: false,
                    startupSource: 'manual' as const,
                },
            })),
        }));
        const { handleDaemonCliCommand } = await import('./daemon');

        try {
            await expect(handleDaemonCliCommand({
                args: ['daemon', 'start-sync'],
            } as never)).rejects.toThrow(/exit:0/);
        } finally {
            exitSpy.mockRestore();
        }

        expect(startDaemonMock).toHaveBeenCalledTimes(1);
        expect(startDaemonMock).toHaveBeenCalledWith({ takeover: false });
    });

    it('fails closed when a background service is installed for the active relay', async () => {
        await withTempDir('happier-daemon-start-sync-installed-', async (homeDir) => {
            envScope.patch({
                HAPPIER_HOME_DIR: join(homeDir, '.happier'),
                HAPPIER_ACTIVE_SERVER_ID: 'cloud',
                HAPPIER_PUBLIC_RELEASE_CHANNEL: 'stable',
                HAPPIER_DAEMON_STARTUP_SOURCE: '',
                HAPPIER_DAEMON_SERVICE_PLATFORM: 'linux',
                HAPPIER_DAEMON_SERVICE_USER_HOME_DIR: homeDir,
                HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR: join(homeDir, '.happier'),
                HAPPIER_DAEMON_SERVICE_CHANNEL: 'stable',
            });
            vi.resetModules();

            const [{ handleDaemonCliCommand }, { resolveDaemonServiceCliRuntimeFromEnv, resolveDaemonServicePaths }, { writeSettings }] = await Promise.all([
                import('./daemon'),
                import('@/daemon/service/cli'),
                import('@/persistence'),
            ]);

            await writeSettings({
                schemaVersion: 6,
                onboardingCompleted: false,
                activeServerId: 'cloud',
                servers: {
                    cloud: {
                        id: 'cloud',
                        name: 'Happier Cloud',
                        serverUrl: 'https://api.happier.dev',
                        webappUrl: 'https://app.happier.dev',
                        createdAt: 0,
                        updatedAt: 0,
                        lastUsedAt: 0,
                    },
                },
                machineIdByServerId: {},
                machineIdByServerIdByAccountId: {},
                lastTokenSubByServerId: {},
                machineIdConfirmedByServerByServerId: {},
                lastChangesCursorByServerIdByAccountId: {},
            });

            const runtime = resolveDaemonServiceCliRuntimeFromEnv({ processEnv: process.env });
            const paths = resolveDaemonServicePaths(runtime);
            mkdirSync(dirname(paths.installedPath), { recursive: true });
            writeFileSync(
                paths.installedPath,
                renderSystemdServiceUnit({
                    description: 'Happier Daemon',
                    execStart: ['/Users/tester/.happier/cli/current/happier', 'daemon', 'start-sync'],
                    env: {
                        HAPPIER_DAEMON_STARTUP_SOURCE: 'background-service',
                        HAPPIER_DAEMON_SERVICE_TARGET_MODE: 'default-following',
                        HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR: join(homeDir, '.happier'),
                        HAPPIER_PUBLIC_RELEASE_CHANNEL: 'stable',
                    },
                    wantedBy: 'default.target',
                }),
                'utf-8',
            );
            evaluateDaemonStartupServiceConflictMock.mockResolvedValueOnce({
                kind: 'installed-background-service-conflict',
                services: [{
                    label: paths.unitName.replace(/\.service$/i, ''),
                    releaseChannel: 'stable',
                    targetMode: 'default-following',
                    path: paths.installedPath,
                    installed: true,
                    name: 'Happier Daemon',
                    platform: 'linux',
                    serverId: 'default',
                    mode: 'user',
                }],
            });

            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
                throw new Error(`exit:${code ?? ''}`);
            }) as never);
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            try {
                await expect(handleDaemonCliCommand({
                    args: ['daemon', 'start-sync'],
                } as never)).rejects.toThrow(/exit:1/);
            } finally {
                exitSpy.mockRestore();
            }

            expect(startDaemonMock).not.toHaveBeenCalled();
            expect(errorSpy.mock.calls.flat().join(' ')).toContain('background service');
            expect(errorSpy.mock.calls.flat().join(' ')).toContain('kaiwu service start');
            errorSpy.mockRestore();
        });
    });
});
