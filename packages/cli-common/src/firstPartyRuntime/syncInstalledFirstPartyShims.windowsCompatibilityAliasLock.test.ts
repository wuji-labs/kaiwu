import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

if (!originalPlatformDescriptor) {
  throw new Error('process.platform descriptor is required for this test');
}

const platformDescriptor: PropertyDescriptor = originalPlatformDescriptor;

const { lockedPaths } = vi.hoisted(() => ({
  lockedPaths: new Set<string>(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    rmSync: vi.fn((targetPath: unknown, options?: unknown) => {
      const p = String(targetPath);
      if (lockedPaths.has(p)) {
        const error = new Error(`EPERM: operation not permitted, unlink '${p}'`) as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return (actual.rmSync as (target: unknown, opts?: unknown) => void)(targetPath, options);
    }),
  };
});

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
  }
}

async function createStagedPayload(rootDir: string, versionId: string, contents: string): Promise<string> {
  const stagedPayloadPath = join(rootDir, `stage-${versionId}`);
  await mkdir(stagedPayloadPath, { recursive: true });
  await mkdir(join(stagedPayloadPath, 'package-dist'), { recursive: true });
  await writeFile(join(stagedPayloadPath, 'kaiwu.exe'), contents, 'utf8');
  await writeFile(join(stagedPayloadPath, 'package-dist', 'index.mjs'), `export default ${JSON.stringify(versionId)};\n`, 'utf8');
  return stagedPayloadPath;
}

describe('syncInstalledFirstPartyShims Windows locked compatibility alias handling', () => {
  afterEach(() => {
    lockedPaths.clear();
    vi.restoreAllMocks();
  });

  it('warns but does not fail when secondary compatibility alias is locked by running process', async () => {
    await withPlatform('win32', async () => {
      const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-sync-shims-locked-compat-'));
      const env = { ...process.env, HAPPIER_HOME_DIR: homeDir, KAIWU_HOME_DIR: homeDir };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { promoteVersionedPayload, syncInstalledFirstPartyShims } = await import('./index.js');
        await promoteVersionedPayload({
          componentId: 'happier-cli',
          processEnv: env,
          channel: 'stable',
          versionId: '1.0.0',
          stagedPayloadPath: await createStagedPayload(homeDir, '1.0.0', 'kaiwu-binary'),
        });

        const happierShimPath = join(homeDir, 'bin', 'happier.exe');
        lockedPaths.add(happierShimPath);

        const result = await syncInstalledFirstPartyShims({
          componentId: 'happier-cli',
          processEnv: env,
          channel: 'stable',
        });

        const kaiwuShimPath = join(homeDir, 'bin', 'kaiwu.exe');
        expect(existsSync(kaiwuShimPath)).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[kaiwu\] Unable to refresh compatibility alias.*canonical daemon path remains safe/i),
        );
      } finally {
        await rm(homeDir, { recursive: true, force: true });
      }
    });
  });

  it('throws error when primary canonical shim fails to refresh', async () => {
    await withPlatform('win32', async () => {
      const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-sync-shims-locked-primary-'));
      const env = { ...process.env, HAPPIER_HOME_DIR: homeDir, KAIWU_HOME_DIR: homeDir };

      try {
        const { promoteVersionedPayload, syncInstalledFirstPartyShims } = await import('./index.js');
        await promoteVersionedPayload({
          componentId: 'happier-cli',
          processEnv: env,
          channel: 'stable',
          versionId: '1.0.0',
          stagedPayloadPath: await createStagedPayload(homeDir, '1.0.0', 'kaiwu-binary'),
        });

        const kaiwuShimPath = join(homeDir, 'bin', 'kaiwu.exe');
        lockedPaths.add(kaiwuShimPath);

        await expect(
          syncInstalledFirstPartyShims({
            componentId: 'happier-cli',
            processEnv: env,
            channel: 'stable',
          }),
        ).rejects.toThrow(/EPERM/);
      } finally {
        await rm(homeDir, { recursive: true, force: true });
      }
    });
  });
});
