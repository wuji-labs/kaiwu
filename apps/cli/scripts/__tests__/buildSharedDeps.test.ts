import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createTempDirSync, removeTempDirSync } from '../../src/testkit/fs/tempDir';
import { resolveBundledWorkspaceDependencyBuildOrder } from '../../../../scripts/workspaces/resolveWorkspaceDependencyBuildOrder.mjs';
import {
  ensureCliDeclarationPrerequisites,
  syncBundledWorkspaceDist,
  syncCliRuntimeDependencies,
  withBuildSharedDepsLock,
} from '../buildSharedDeps.mjs';
import {
  createPackageLayoutSandbox,
  writeCliBundledHostPackage,
  writeRuntimeDependencyStub,
} from './testkit/packageLayoutSandbox';

describe('buildSharedDeps', () => {
  it('orders bundled workspace builds so internal workspace dependencies compile first', () => {
    const repoRoot = createTempDirSync('happier-cli-build-shared-order-');
    try {
      mkdirSync(resolve(repoRoot, 'apps', 'cli'), { recursive: true });
      writeFileSync(
        resolve(repoRoot, 'apps', 'cli', 'package.json'),
        JSON.stringify(
          {
            bundledDependencies: [
              '@happier-dev/cli-common',
              '@happier-dev/release-runtime',
              '@happier-dev/agents',
              '@happier-dev/protocol',
            ],
          },
          null,
          2,
        ),
        'utf8',
      );

      const packageJsonByWorkspace: Record<string, Record<string, unknown>> = {
        protocol: {
          name: '@happier-dev/protocol',
        },
        agents: {
          name: '@happier-dev/agents',
          dependencies: {
            '@happier-dev/protocol': '0.0.0',
          },
        },
        'release-runtime': {
          name: '@happier-dev/release-runtime',
        },
        'cli-common': {
          name: '@happier-dev/cli-common',
          dependencies: {
            '@happier-dev/agents': '0.0.0',
            '@happier-dev/release-runtime': '0.0.0',
          },
        },
      };

      for (const [workspaceName, packageJson] of Object.entries(packageJsonByWorkspace)) {
        mkdirSync(resolve(repoRoot, 'packages', workspaceName), { recursive: true });
        writeFileSync(
          resolve(repoRoot, 'packages', workspaceName, 'package.json'),
          JSON.stringify(packageJson, null, 2),
          'utf8',
        );
        writeFileSync(resolve(repoRoot, 'packages', workspaceName, 'tsconfig.json'), '{}\n', 'utf8');
      }

      const ordered = resolveBundledWorkspaceDependencyBuildOrder({
        repoRoot,
        hostPackageDir: resolve(repoRoot, 'apps', 'cli'),
      });

      expect(ordered.indexOf('protocol')).toBeLessThan(ordered.indexOf('agents'));
      expect(ordered.indexOf('agents')).toBeLessThan(ordered.indexOf('cli-common'));
      expect(ordered.indexOf('release-runtime')).toBeLessThan(ordered.indexOf('cli-common'));
    } finally {
      removeTempDirSync(repoRoot);
    }
  });

  it('syncs workspace dist outputs into bundled deps for local bundled hosts when present', () => {
    const cpSync = vi.fn(() => undefined);
    const rmSync = vi.fn(() => undefined);
    const normalizePath = (p: any) => String(p ?? '').replaceAll('\\', '/');
    const existsSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      return (
        text.endsWith('/apps/cli/package.json') ||
        text.endsWith('/packages/protocol/package.json') ||
        text.endsWith('/packages/protocol/dist') ||
        text.includes('/apps/cli/node_modules/@happier-dev/protocol/')
      );
    });
    const mkdirSync = vi.fn(() => undefined);
    const readFileSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      if (text.endsWith('/apps/cli/package.json')) {
        return JSON.stringify({
          bundledDependencies: ['@happier-dev/protocol'],
        });
      }
      if (text.endsWith('/packages/protocol/package.json')) {
        return JSON.stringify({
          name: '@happier-dev/protocol',
          version: '0.0.0',
          type: 'module',
          exports: { '.': { default: './dist/index.js' } },
        });
      }
      throw new Error(`unexpected read: ${text}`);
    });

    syncBundledWorkspaceDist({
      repoRoot: '/repo',
      cpSync,
      existsSync,
      mkdirSync,
      rmSync,
      readFileSync,
    });

    expect(mkdirSync.mock.calls).toEqual([
      [resolve('/repo', 'apps', 'cli', 'node_modules', '@happier-dev', 'protocol'), { recursive: true }],
      [resolve('/repo', 'apps', 'cli', 'node_modules', '@happier-dev', 'protocol'), { recursive: true }],
    ]);
    expect(rmSync).toHaveBeenCalled();
    expect(cpSync).toHaveBeenCalledTimes(1);
    const copyCalls = cpSync.mock.calls as unknown[];
    expect(
      copyCalls.some((call) => {
        if (!Array.isArray(call) || call.length < 3) return false;
        const [from, to, options] = call as [unknown, unknown, { recursive?: boolean; force?: boolean }];
        return normalizePath(from) === normalizePath(resolve('/repo', 'packages', 'protocol', 'dist'))
          && typeof to === 'string'
          && normalizePath(to).includes('/apps/cli/node_modules/@happier-dev/protocol/')
          && options.recursive === true
          && options.force === true;
      }),
    ).toBe(true);
    expect(copyCalls.some((call) => Array.isArray(call) && String(call[1]).includes('/apps/stack/'))).toBe(false);
  });

  it('syncs bundled workspace package.json exports for local bundled hosts', () => {
    const cpSync = vi.fn(() => undefined);
    const normalizePath = (p: any) => String(p ?? '').replaceAll('\\', '/');
    const existsSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      return (
        text.endsWith('/apps/cli/package.json') ||
        text.endsWith('/packages/protocol/package.json') ||
        text.includes('/apps/cli/node_modules/@happier-dev/protocol/dist') ||
        text.includes('/apps/stack/node_modules/@happier-dev/protocol/dist')
      );
    });
    const readFileSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      if (text.endsWith('/apps/cli/package.json')) {
        return JSON.stringify({
          bundledDependencies: ['@happier-dev/protocol'],
        });
      }

      return JSON.stringify({
        name: '@happier-dev/protocol',
        version: '0.0.0',
        type: 'module',
        exports: { '.': { default: './dist/index.js' }, './installables': { default: './dist/installables.js' } },
        dependencies: { zod: '1.0.0' },
      });
    });
    const writeFileSync = vi.fn(() => undefined);
    const mkdirSync = vi.fn(() => undefined);

    syncBundledWorkspaceDist({
      repoRoot: '/repo',
      cpSync,
      existsSync,
      mkdirSync,
      readFileSync,
      writeFileSync,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const cliWriteCall = writeFileSync.mock.calls[0] as unknown as [string, string] | undefined;
    if (!cliWriteCall) throw new Error('expected cli package.json write');
    const [cliDestPath, cliPayload] = cliWriteCall;
    expect(cliDestPath).toBe(resolve('/repo', 'apps', 'cli', 'node_modules', '@happier-dev', 'protocol', 'package.json'));
    const cliParsed = JSON.parse(String(cliPayload));
    expect(cliParsed.exports?.['./installables']).toBeTruthy();
    expect(cliParsed.private).toBe(true);
  });

  it('derives the default bundled workspace sync set from the CLI manifest', () => {
    const cpSync = vi.fn(() => undefined);
    const normalizePath = (p: any) => String(p ?? '').replaceAll('\\', '/');
    const existsSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      return (
        text.endsWith('/apps/cli/package.json') ||
        text.endsWith('/packages/custom-bundle/package.json') ||
        text.endsWith('/packages/custom-bundle/dist') ||
        text.endsWith('/apps/cli/node_modules/@happier-dev/custom-bundle/package.json') ||
        text.endsWith('/apps/cli/node_modules/@happier-dev/custom-bundle/dist')
      );
    });
    const mkdirSync = vi.fn(() => undefined);
    const rmSync = vi.fn(() => undefined);
    const readFileSync = vi.fn((p: any) => {
      const text = normalizePath(p);
      if (text.endsWith('/apps/cli/package.json')) {
        return JSON.stringify({
          bundledDependencies: ['@happier-dev/custom-bundle', 'tweetnacl'],
        });
      }
      if (text.endsWith('/packages/custom-bundle/package.json')) {
        return JSON.stringify({
          name: '@happier-dev/custom-bundle',
          version: '0.0.0',
          type: 'module',
          exports: { '.': { default: './dist/index.js' } },
        });
      }
      throw new Error(`unexpected read: ${text}`);
    });
    const writeFileSync = vi.fn(() => undefined);

    syncBundledWorkspaceDist({
      repoRoot: '/repo',
      cpSync,
      existsSync,
      mkdirSync,
      rmSync,
      readFileSync,
      writeFileSync,
    });

    const calls = cpSync.mock.calls as unknown[];
    expect(
      calls.some((call) => {
        if (!Array.isArray(call) || call.length < 3) return false;
        const [from, to, options] = call as [unknown, unknown, { recursive?: boolean; force?: boolean }];
        return normalizePath(from) === normalizePath(resolve('/repo', 'packages', 'custom-bundle', 'dist'))
          && typeof to === 'string'
          && normalizePath(to).includes('/apps/cli/node_modules/@happier-dev/custom-bundle/')
          && options.recursive === true
          && options.force === true;
      }),
    ).toBe(true);
  });

  it('bundles tweetnacl into the CLI publish tree for packaged installs', async () => {
    const { repoRoot, happyCliDir, cleanup } = createPackageLayoutSandbox('happy-build-shared-runtime-');

    try {
      writeRuntimeDependencyStub({
        repoRoot,
        packageName: 'tweetnacl',
        manifestOverrides: {
          version: '1.0.3',
          main: 'nacl-fast.js',
        },
        files: {
          'nacl-fast.js': 'module.exports = {};\n',
        },
      });
      writeCliBundledHostPackage({
        happyCliDir,
        dependencies: {
          tweetnacl: '^1.0.3',
        },
      });

      await syncCliRuntimeDependencies({ repoRoot });

      expect(existsSync(resolve(repoRoot, 'apps', 'cli', 'node_modules', 'tweetnacl', 'package.json'))).toBe(true);
      expect(existsSync(resolve(repoRoot, 'apps', 'cli', 'node_modules', 'tweetnacl', 'nacl-fast.js'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('serializes concurrent shared-deps builds through a single lock', async () => {
    const rootDir = createTempDirSync('happy-build-shared-lock-');
    try {
      const lockPath = resolve(rootDir, 'cli-dist-build.lock');
      const events: string[] = [];
      let releaseFirst: (() => void) | null = null;

      const first = withBuildSharedDepsLock(async () => {
        events.push('first:start');
        await new Promise<void>((resolvePromise) => {
          releaseFirst = resolvePromise;
        });
        events.push('first:end');
      }, {
        lockPath,
        timeoutMs: 2_000,
        pollIntervalMs: 10,
        staleAfterMs: 1_000,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(events).toEqual(['first:start']);

      const second = withBuildSharedDepsLock(async () => {
        events.push('second:start');
      }, {
        lockPath,
        timeoutMs: 30_000,
        pollIntervalMs: 10,
        staleAfterMs: 1_000,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(events).toEqual(['first:start']);

      releaseFirst?.();
      await Promise.all([first, second]);

      expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    } finally {
      removeTempDirSync(rootDir);
    }
  });

  it('detects newer workspace runtime entrypoint and syncs bundled deps when declaration files are unchanged', async () => {
    const repoRoot = createTempDirSync('happy-build-shared-freshness-');
    try {
      mkdirSync(resolve(repoRoot, 'apps', 'cli'), { recursive: true });
      writeFileSync(
        resolve(repoRoot, 'apps', 'cli', 'package.json'),
        JSON.stringify(
          {
            bundledDependencies: ['@happier-dev/protocol'],
          },
          null,
          2,
        ),
        'utf8',
      );

      const protocolDir = resolve(repoRoot, 'packages', 'protocol');
      mkdirSync(resolve(protocolDir, 'dist'), { recursive: true });
      writeFileSync(
        resolve(protocolDir, 'package.json'),
        JSON.stringify(
          {
            name: '@happier-dev/protocol',
            version: '0.0.0',
            type: 'module',
            main: './dist/index.js',
            types: './dist/index.d.ts',
            exports: {
              '.': {
                types: './dist/index.d.ts',
                default: './dist/index.js',
              },
            },
          },
          null,
          2,
        ),
        'utf8',
      );
      writeFileSync(resolve(protocolDir, 'tsconfig.json'), '{}\n', 'utf8');

      const bundledProtocolDir = resolve(
        repoRoot,
        'apps',
        'cli',
        'node_modules',
        '@happier-dev',
        'protocol',
      );
      mkdirSync(resolve(bundledProtocolDir, 'dist'), { recursive: true });
      writeFileSync(
        resolve(bundledProtocolDir, 'package.json'),
        JSON.stringify(
          {
            name: '@happier-dev/protocol',
            version: '0.0.0',
            private: true,
            type: 'module',
            main: './dist/index.js',
            types: './dist/index.d.ts',
            exports: {
              '.': {
                types: './dist/index.d.ts',
                default: './dist/index.js',
              },
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      // Declaration files are identical and current (same timestamp)
      const baseTime = new Date(Date.now() - 30_000);
      const newerTime = new Date(Date.now());

      writeFileSync(resolve(protocolDir, 'dist', 'index.d.ts'), 'export declare const v: number;\n', 'utf8');
      writeFileSync(resolve(bundledProtocolDir, 'dist', 'index.d.ts'), 'export declare const v: number;\n', 'utf8');
      utimesSync(resolve(protocolDir, 'dist', 'index.d.ts'), baseTime, baseTime);
      utimesSync(resolve(bundledProtocolDir, 'dist', 'index.d.ts'), baseTime, baseTime);

      // Source runtime entrypoint is newer than bundled copy
      writeFileSync(resolve(bundledProtocolDir, 'dist', 'index.js'), 'export const v = 1;\n', 'utf8');
      utimesSync(resolve(bundledProtocolDir, 'dist', 'index.js'), baseTime, baseTime);

      writeFileSync(resolve(protocolDir, 'dist', 'index.js'), 'export const v = 2;\n', 'utf8');
      utimesSync(resolve(protocolDir, 'dist', 'index.js'), newerTime, newerTime);

      const result = await ensureCliDeclarationPrerequisites({
        repoRoot,
        workspaceNames: ['protocol'],
      });

      expect(result.workspaces).toEqual(['protocol']);
      expect(
        readFileSync(resolve(bundledProtocolDir, 'dist', 'index.js'), 'utf8'),
      ).toBe('export const v = 2;\n');
    } finally {
      removeTempDirSync(repoRoot);
    }
  });

  it('honors a parent-held dist build lock handoff without waiting on itself', async () => {
    const rootDir = createTempDirSync('happy-build-shared-parent-lock-');
    try {
      const lockPath = resolve(rootDir, 'cli-dist-build.lock');
      const events: string[] = [];

      await withBuildSharedDepsLock(async ({ heldLockValue }) => {
        events.push('parent:start');
        await withBuildSharedDepsLock(async () => {
          events.push('child:start');
        }, {
          lockPath,
          timeoutMs: 50,
          pollIntervalMs: 10,
          staleAfterMs: 1_000,
          env: { HAPPIER_WORKSPACE_DIST_BUILD_LOCK_HELD: heldLockValue },
        });
        events.push('parent:end');
      }, {
        lockPath,
        timeoutMs: 2_000,
        pollIntervalMs: 10,
        staleAfterMs: 1_000,
      });

      expect(events).toEqual(['parent:start', 'child:start', 'parent:end']);
    } finally {
      removeTempDirSync(rootDir);
    }
  });
});
