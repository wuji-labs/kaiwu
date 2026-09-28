import { describe, expect, it, vi } from 'vitest';
import { spawnSync as spawnLocalCommand } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { installProviderCli, resolvePlatformFromNodePlatform } from './install.js';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArchDescriptor = Object.getOwnPropertyDescriptor(process, 'arch');

describe('installProviderCli vendor_recipe execution gating', () => {
  it('denies vendor_recipe execution by default (but still returns the plan)', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-gating-log-'));
    try {
      const platform = resolvePlatformFromNodePlatform(process.platform);
      expect(platform).not.toBeNull();
      if (!platform) return;

      const res = await installProviderCli({
        providerId: 'claude',
        platform,
        logDir,
        // Avoid accidentally running real commands in the pre-gating implementation.
        env: { ...process.env, PATH: '' },
        skipIfInstalled: false,
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;

      expect(res.errorCode).toBe('vendor-recipe-disallowed');
      expect(res.plan?.installMode).toBe('vendor_recipe');
      expect(res.logPath).toBeNull();
      expect(res.errorMessage).toContain('allowVendorRecipeExecution');
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('uses injected spawnSync for managed_package installs (no real processes in tests)', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-gating-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-gating-log-'));
    try {
      const platform = resolvePlatformFromNodePlatform(process.platform);
      expect(platform).not.toBeNull();
      if (!platform) return;

      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi
        .fn<SpawnSyncMockFn>(() => ({
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }))
        .mockName('spawnSync');

      const res = await installProviderCli({
        providerId: 'gemini',
        platform,
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          PATH: '',
        },
        skipIfInstalled: false,
        deps: {
          ensureManagedPnpmCommand: async () => 'pnpm-does-not-exist',
          ensureManagedJavaScriptRuntimeCommand: async () => '/nonexistent/node',
          // Intentionally inject a spawnSync implementation so tests never spawn real processes.
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.plan.installMode).toBe('managed_package');
      expect(spawnSyncMock).toHaveBeenCalled();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('installs Windows OpenCode through managed pnpm instead of system npm', async () => {
    if (!originalPlatformDescriptor || !originalArchDescriptor) {
      throw new Error('Expected process.platform to be configurable for this test');
    }
    Object.defineProperty(process, 'platform', { ...originalPlatformDescriptor, value: 'win32' });
    Object.defineProperty(process, 'arch', { ...originalArchDescriptor, value: 'x64' });

    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-opencode-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-opencode-log-'));
    try {
      const runtimeDir = join(homeDir, 'managed-runtime');
      const runtimeCommand = join(runtimeDir, 'node.exe');
      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi.fn<SpawnSyncMockFn>((_command, args, options) => {
        if (args?.includes('opencode-ai') && typeof options?.cwd === 'string') {
          const workspaceDir = options.cwd;
          const opencodePackageDir = join(workspaceDir, 'node_modules', 'opencode-ai');
          const opencodeBinDir = join(opencodePackageDir, 'bin');
          mkdirSync(opencodeBinDir, { recursive: true });
          writeFileSync(
            join(opencodePackageDir, 'package.json'),
            JSON.stringify({
              name: 'opencode-ai',
              optionalDependencies: {
                'opencode-windows-x64': '1.17.8',
                'opencode-windows-x64-baseline': '1.17.8',
              },
            }, null, 2),
            'utf8',
          );
          writeFileSync(join(opencodeBinDir, 'opencode.exe'), 'Error: opencode-ai postinstall was not run.\n', 'utf8');
          for (const packageName of ['opencode-windows-x64', 'opencode-windows-x64-baseline']) {
            const platformPackageDir = join(
              workspaceDir,
              'node_modules',
              '.pnpm',
              `${packageName}@1.17.8`,
              'node_modules',
              packageName,
            );
            const platformBinDir = join(platformPackageDir, 'bin');
            mkdirSync(platformBinDir, { recursive: true });
            writeFileSync(join(platformPackageDir, 'package.json'), JSON.stringify({ name: packageName }, null, 2), 'utf8');
            writeFileSync(join(platformBinDir, 'opencode.exe'), `REAL OPENCODE BINARY ${packageName}\n`, 'utf8');
          }
        }
        return {
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        };
      }).mockName('spawnSync');

      const res = await installProviderCli({
        providerId: 'opencode',
        platform: 'win32',
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          PATH: '',
          PATHEXT: '.EXE;.CMD;.BAT;.COM',
          COMSPEC: 'C:\\WINDOWS\\system32\\cmd.exe',
        },
        skipIfInstalled: false,
        deps: {
          ensureManagedPnpmCommand: async () => 'C:\\happier\\managed\\pnpm.cmd',
          ensureManagedJavaScriptRuntimeCommand: async () => runtimeCommand,
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.plan.installMode).toBe('managed_package');
      expect(res.plan.managedInstall).toEqual({
        kind: 'managed_package',
        packageName: 'opencode-ai',
        binaryName: 'opencode',
        packageBinarySetup: { kind: 'opencode_platform_binary' },
      });
      const firstCall = spawnSyncMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall?.[0]).toBe('C:\\happier\\managed\\pnpm.cmd');
      expect(firstCall?.[1]).toContain('opencode-ai');
      expect(firstCall?.[1]).not.toEqual(['/c', 'npm install -g opencode-ai']);
      expect(String(firstCall?.[2]?.env?.PATH ?? '')).toContain(runtimeDir);
      const systemNpmCalls = spawnSyncMock.mock.calls.filter(([command]) => /(?:^|[\\/])npm(?:\.(?:cmd|exe))?$/i.test(command));
      expect(systemNpmCalls).toEqual([]);
      const materializedBinary = await readFile(
        join(homeDir, 'tools', 'providers', 'opencode', 'current', 'workspace', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        'utf8',
      );
      expect(materializedBinary).toContain('REAL OPENCODE BINARY');
    } finally {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
      Object.defineProperty(process, 'arch', originalArchDescriptor);
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('materializes the Unix OpenCode package bin target so the managed launcher is runnable', async () => {
    if (!originalPlatformDescriptor || !originalArchDescriptor) {
      throw new Error('Expected process.platform to be configurable for this test');
    }
    Object.defineProperty(process, 'platform', { ...originalPlatformDescriptor, value: 'darwin' });
    Object.defineProperty(process, 'arch', { ...originalArchDescriptor, value: 'arm64' });

    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-opencode-unix-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-opencode-unix-log-'));
    try {
      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi.fn<SpawnSyncMockFn>((_command, args, options) => {
        if (args?.includes('opencode-ai') && typeof options?.cwd === 'string') {
          const workspaceDir = options.cwd;
          const opencodePackageDir = join(workspaceDir, 'node_modules', 'opencode-ai');
          const opencodeBinDir = join(opencodePackageDir, 'bin');
          const nodeModulesBinDir = join(workspaceDir, 'node_modules', '.bin');
          mkdirSync(opencodeBinDir, { recursive: true });
          mkdirSync(nodeModulesBinDir, { recursive: true });
          writeFileSync(
            join(opencodePackageDir, 'package.json'),
            JSON.stringify({
              name: 'opencode-ai',
              bin: {
                opencode: 'bin/opencode.exe',
              },
              optionalDependencies: {
                'opencode-darwin-arm64': '1.17.8',
              },
            }, null, 2),
            'utf8',
          );
          writeFileSync(
            join(opencodeBinDir, 'opencode.exe'),
            '#!/bin/sh\necho "Error: opencode-ai\'s postinstall script was not run." >&2\nexit 1\n',
            'utf8',
          );
          chmodSync(join(opencodeBinDir, 'opencode.exe'), 0o755);
          writeFileSync(
            join(nodeModulesBinDir, 'opencode'),
            '#!/bin/sh\nshim_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$shim_dir/../opencode-ai/bin/opencode.exe" "$@"\n',
            'utf8',
          );
          chmodSync(join(nodeModulesBinDir, 'opencode'), 0o755);
          const platformPackageDir = join(
            workspaceDir,
            'node_modules',
            '.pnpm',
            'opencode-darwin-arm64@1.17.8',
            'node_modules',
            'opencode-darwin-arm64',
          );
          const platformBinDir = join(platformPackageDir, 'bin');
          mkdirSync(platformBinDir, { recursive: true });
          writeFileSync(join(platformPackageDir, 'package.json'), JSON.stringify({ name: 'opencode-darwin-arm64' }, null, 2), 'utf8');
          writeFileSync(
            join(platformBinDir, 'opencode'),
            '#!/bin/sh\necho "REAL OPENCODE BINARY opencode-darwin-arm64 $*"\n',
            'utf8',
          );
          chmodSync(join(platformBinDir, 'opencode'), 0o755);
        }
        return {
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        };
      }).mockName('spawnSync');

      const res = await installProviderCli({
        providerId: 'opencode',
        platform: 'darwin',
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          PATH: '',
        },
        skipIfInstalled: false,
        deps: {
          ensureManagedPnpmCommand: async () => '/managed/pnpm',
          ensureManagedJavaScriptRuntimeCommand: async () => '/managed/node/bin/node',
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const launcherPath = join(homeDir, 'tools', 'providers', 'opencode', 'current', 'bin', 'opencode');
      const launched = spawnLocalCommand(launcherPath, ['--version'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: '/usr/bin:/bin',
        },
      });
      const combinedOutput = `${launched.stdout ?? ''}${launched.stderr ?? ''}`;
      expect(combinedOutput).not.toContain("opencode-ai's postinstall script was not run");
      expect(launched.status).toBe(0);
      expect(combinedOutput).toContain('REAL OPENCODE BINARY opencode-darwin-arm64 --version');
      const materializedPackageBinTarget = await readFile(
        join(homeDir, 'tools', 'providers', 'opencode', 'current', 'workspace', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        'utf8',
      );
      expect(materializedPackageBinTarget).toContain('REAL OPENCODE BINARY');
    } finally {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
      Object.defineProperty(process, 'arch', originalArchDescriptor);
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('writes install logs with private file permissions', async () => {
    if (process.platform === 'win32') return;
    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-log-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-log-dir-'));
    try {
      const platform = resolvePlatformFromNodePlatform(process.platform);
      expect(platform).not.toBeNull();
      if (!platform) return;

      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi
        .fn<SpawnSyncMockFn>(() => ({
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }))
        .mockName('spawnSync');

      const res = await installProviderCli({
        providerId: 'gemini',
        platform,
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          PATH: '',
        },
        skipIfInstalled: false,
        deps: {
          ensureManagedPnpmCommand: async () => 'pnpm-does-not-exist',
          ensureManagedJavaScriptRuntimeCommand: async () => '/nonexistent/node',
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.logPath).not.toBeNull();
      if (!res.logPath) return;

      const fileStat = await stat(res.logPath);
      expect(fileStat.mode & 0o777).toBe(0o600);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('prepends the managed JavaScript runtime path when installing managed packages', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-runtime-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-runtime-log-'));
    try {
      const platform = resolvePlatformFromNodePlatform(process.platform);
      expect(platform).not.toBeNull();
      if (!platform) return;

      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi
        .fn<SpawnSyncMockFn>(() => ({
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }))
        .mockName('spawnSync');

      const runtimeCommand =
        process.platform === 'win32' ? 'C:\\managed\\node\\node.exe' : '/managed/node/bin/node';

      const res = await installProviderCli({
        providerId: 'gemini',
        platform,
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          PATH: '',
        },
        skipIfInstalled: false,
        deps: {
          ensureManagedPnpmCommand: async () => 'pnpm-does-not-exist',
          ensureManagedJavaScriptRuntimeCommand: async () => runtimeCommand,
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(true);
      const firstCall = spawnSyncMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const spawnEnv = firstCall?.[2]?.env;
      expect(typeof spawnEnv?.PATH).toBe('string');
      expect(String(spawnEnv?.PATH)).toContain(process.platform === 'win32' ? 'C:\\managed\\node' : '/managed/node/bin');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('surfaces a targeted memory-pressure hint when a vendor recipe is killed with exit 137', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-vendor-oom-home-'));
    const logDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-vendor-oom-log-'));
    const binDir = await mkdtemp(join(tmpdir(), 'happier-cli-common-install-vendor-oom-bin-'));
    try {
      const platform = resolvePlatformFromNodePlatform(process.platform);
      expect(platform).not.toBeNull();
      if (!platform) return;

      type SpawnSyncFn = typeof import('node:child_process').spawnSync;
      type SpawnSyncMockFn = (
        command: string,
        args?: ReadonlyArray<string>,
        options?: import('node:child_process').SpawnSyncOptions,
      ) => import('node:child_process').SpawnSyncReturns<Buffer>;
      const spawnSyncMock = vi
        .fn<SpawnSyncMockFn>(() => ({
          pid: 0,
          output: [null, Buffer.alloc(0), Buffer.from('installer died')],
          status: 137,
          signal: 'SIGKILL',
          stdout: Buffer.alloc(0),
          stderr: Buffer.from('installer died'),
        }))
        .mockName('spawnSync');

      const bashPath = join(binDir, process.platform === 'win32' ? 'bash.cmd' : 'bash');
      await writeFile(bashPath, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
      if (process.platform !== 'win32') {
        await chmod(bashPath, 0o755);
      }

      const res = await installProviderCli({
        providerId: 'claude',
        platform,
        logDir,
        env: {
          ...process.env,
          HAPPIER_HOME_DIR: homeDir,
          KAIWU_HOME_DIR: homeDir,
          HOME: homeDir,
          PATH: `${binDir}:/bin`,
        },
        skipIfInstalled: false,
        allowVendorRecipeExecution: true,
        deps: {
          spawnSync: spawnSyncMock as unknown as SpawnSyncFn,
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.errorCode).toBe('command-failed');
      expect(res.errorMessage).toContain('ran out of memory');
      expect(res.errorMessage).toContain('increase available memory or swap');
      expect(res.logPath).not.toBeNull();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(logDir, { recursive: true, force: true });
      await rm(binDir, { recursive: true, force: true });
    }
  });
});
