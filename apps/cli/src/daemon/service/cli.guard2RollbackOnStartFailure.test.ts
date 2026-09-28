import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { renderSystemdServiceUnit } from '@happier-dev/cli-common/service';
import { createEnvKeyScope } from '@/testkit/env/envScope';
import { withTempDir } from '@/testkit/fs/tempDir';

const SCOPED_ENV_KEYS = [
  'HAPPIER_DAEMON_SERVICE_PLATFORM',
  'HAPPIER_DAEMON_SERVICE_USER_HOME_DIR',
  'HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR',
  'HAPPIER_DAEMON_SERVICE_INSTANCE_ID',
  'HAPPIER_DAEMON_SERVICE_NODE_PATH',
  'HAPPIER_DAEMON_SERVICE_ENTRY_PATH',
  'HAPPIER_DAEMON_SERVICE_MODE',
  'HAPPIER_DAEMON_SERVICE_SYSTEM_USER',
  'HAPPIER_DAEMON_SERVICE_CHANNEL',
  'HAPPIER_DAEMON_SERVICE_TARGET_MODE',
  'HAPPIER_PUBLIC_RELEASE_CHANNEL',
  'HAPPIER_SERVER_URL',
  'HAPPIER_PUBLIC_SERVER_URL',
  'HAPPIER_LOCAL_SERVER_URL',
  'HAPPIER_WEBAPP_URL',
  'HAPPIER_HOME_DIR',
  'HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_TIMEOUT_MS',
  'HAPPIER_DAEMON_SERVICE_OWNERSHIP_ACTIVE_GRACE_TIMEOUT_MS',
  'HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_POLL_MS',
  'HAPPIER_DAEMON_SERVICE_OWNERSHIP_STABLE_MS',
  'HAPPIER_DAEMON_START_WAIT_TIMEOUT_MS',
  'HAPPIER_DAEMON_START_WAIT_POLL_MS',
  'HAPPIER_CLI_INVOKER_NAME',
  'PATH',
] as const;

function writeValidInstalledDaemonServiceFile(installedPath: string): string {
  const content = renderSystemdServiceUnit({
    description: 'Happier Daemon',
    execStart: ['/Users/tester/.happier/cli/current/happier', 'daemon', 'start-sync'],
    env: {
      HAPPIER_DAEMON_STARTUP_SOURCE: 'background-service',
      HAPPIER_DAEMON_SERVICE_TARGET_MODE: 'default-following',
      HAPPIER_ACTIVE_SERVER_ID: 'cloud',
      HAPPIER_PUBLIC_RELEASE_CHANNEL: 'stable',
    },
    wantedBy: 'default.target',
  });
  writeFileSync(installedPath, content, 'utf-8');
  return content;
}

describe('Guard 2: rollback service definition on restart/start failure', () => {
  const envScope = createEnvKeyScope(SCOPED_ENV_KEYS);

  afterEach(() => {
    envScope.restore();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('automatically restores backed up service script and attempts re-start when restart fails to bring up daemon', async () => {
    await withTempDir('guard2-rollback-restart-failure-', async (homeDir) => {
      const happierHomeDir = `${homeDir}/.happier`;
      envScope.patch({
        HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_PLATFORM: 'linux',
        HAPPIER_DAEMON_SERVICE_USER_HOME_DIR: homeDir,
        HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_TIMEOUT_MS: '150',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_POLL_MS: '10',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_STABLE_MS: '20',
      });

      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>();
        return {
          ...actual,
          spawnSync: vi.fn(() => ({
            status: 0,
            stdout: Buffer.from(''),
            stderr: Buffer.from(''),
          })),
        };
      });

      vi.doMock('./commandExistsInPath', () => ({
        commandExistsInPath: vi.fn(() => true),
      }));

      const {
        runDaemonServiceCliCommand,
        resolveDaemonServiceCliRuntimeFromEnv,
        resolveDaemonServicePaths,
      } = await import('./cli');
      const { configuration } = await import('@/configuration');
      writeFileSync(
        configuration.privateKeyFile,
        JSON.stringify({ token: 'test-token', secret: Buffer.from('12345678901234567890123456789012').toString('base64') }),
        'utf8',
      );

      const runtime = resolveDaemonServiceCliRuntimeFromEnv({ targetMode: 'default-following' });
      const paths = resolveDaemonServicePaths(runtime);
      mkdirSync(dirname(paths.installedPath), { recursive: true });

      const originalGoodScript = writeValidInstalledDaemonServiceFile(paths.installedPath);

      // Attempting restart with no active daemon will time out and fail ownership assert
      await expect(
        runDaemonServiceCliCommand({ argv: ['restart'] }),
      ).rejects.toThrow(/已自动恢复重启前备份的服务脚本并尝试重新启动/);

      // Verify the file was restored to its backup contents
      expect(existsSync(paths.installedPath)).toBe(true);
      const restoredContent = readFileSync(paths.installedPath, 'utf8');
      expect(restoredContent).toBe(originalGoodScript);
    });
  });

  it('automatically restores backed up service script when start fails to bring up daemon', async () => {
    await withTempDir('guard2-rollback-start-failure-', async (homeDir) => {
      const happierHomeDir = `${homeDir}/.happier`;
      envScope.patch({
        HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_PLATFORM: 'linux',
        HAPPIER_DAEMON_SERVICE_USER_HOME_DIR: homeDir,
        HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_TIMEOUT_MS: '150',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_POLL_MS: '10',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_STABLE_MS: '20',
      });

      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>();
        return {
          ...actual,
          spawnSync: vi.fn(() => ({
            status: 0,
            stdout: Buffer.from(''),
            stderr: Buffer.from(''),
          })),
        };
      });

      vi.doMock('./commandExistsInPath', () => ({
        commandExistsInPath: vi.fn(() => true),
      }));

      const {
        runDaemonServiceCliCommand,
        resolveDaemonServiceCliRuntimeFromEnv,
        resolveDaemonServicePaths,
      } = await import('./cli');
      const { configuration } = await import('@/configuration');
      writeFileSync(
        configuration.privateKeyFile,
        JSON.stringify({ token: 'test-token', secret: Buffer.from('12345678901234567890123456789012').toString('base64') }),
        'utf8',
      );

      const runtime = resolveDaemonServiceCliRuntimeFromEnv({ targetMode: 'default-following' });
      const paths = resolveDaemonServicePaths(runtime);
      mkdirSync(dirname(paths.installedPath), { recursive: true });

      const originalGoodScript = writeValidInstalledDaemonServiceFile(paths.installedPath);

      await expect(
        runDaemonServiceCliCommand({ argv: ['start'] }),
      ).rejects.toThrow(/已自动恢复重启前备份的服务脚本并尝试重新启动/);

      expect(existsSync(paths.installedPath)).toBe(true);
      const restoredContent = readFileSync(paths.installedPath, 'utf8');
      expect(restoredContent).toBe(originalGoodScript);
    });
  });

  it('automatically restores backed up service script when restarted daemon version does not match expected version', async () => {
    await withTempDir('guard2-rollback-version-mismatch-', async (homeDir) => {
      const happierHomeDir = `${homeDir}/.happier`;
      envScope.patch({
        HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_PLATFORM: 'linux',
        HAPPIER_DAEMON_SERVICE_USER_HOME_DIR: homeDir,
        HAPPIER_DAEMON_SERVICE_HAPPIER_HOME_DIR: happierHomeDir,
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_TIMEOUT_MS: '150',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_WAIT_POLL_MS: '10',
        HAPPIER_DAEMON_SERVICE_OWNERSHIP_STABLE_MS: '20',
      });

      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>();
        return {
          ...actual,
          spawnSync: vi.fn(() => ({
            status: 0,
            stdout: Buffer.from(''),
            stderr: Buffer.from(''),
          })),
        };
      });

      vi.doMock('./commandExistsInPath', () => ({
        commandExistsInPath: vi.fn(() => true),
      }));

      const {
        runDaemonServiceCliCommand,
        resolveDaemonServiceCliRuntimeFromEnv,
        resolveDaemonServicePaths,
      } = await import('./cli');
      const { configuration } = await import('@/configuration');
      const { writeDaemonState } = await import('@/persistence');
      writeFileSync(
        configuration.privateKeyFile,
        JSON.stringify({ token: 'test-token', secret: Buffer.from('12345678901234567890123456789012').toString('base64') }),
        'utf8',
      );

      // Emulate daemon running with an old/mismatched version
      writeDaemonState({
        pid: process.pid,
        httpPort: 43118,
        startedAt: Date.now(),
        startedWithCliVersion: '0.0.0-outdated',
        startupSource: 'background-service',
        serviceLabel: 'happier-daemon.default',
        runtimeId: 'runtime-old',
      });

      const runtime = resolveDaemonServiceCliRuntimeFromEnv({ targetMode: 'default-following' });
      const paths = resolveDaemonServicePaths(runtime);
      mkdirSync(dirname(paths.installedPath), { recursive: true });

      const originalGoodScript = writeValidInstalledDaemonServiceFile(paths.installedPath);

      await expect(
        runDaemonServiceCliCommand({ argv: ['restart'] }),
      ).rejects.toThrow(/已自动恢复重启前备份的服务脚本并尝试重新启动/);

      expect(existsSync(paths.installedPath)).toBe(true);
      const restoredContent = readFileSync(paths.installedPath, 'utf8');
      expect(restoredContent).toBe(originalGoodScript);
    });
  });
});
