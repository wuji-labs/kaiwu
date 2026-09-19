import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const probedPaths: string[] = [];

vi.mock('@/daemon/service/resolveCliVersionFromBinary', () => ({
  resolveCliVersionFromBinary: vi.fn(({ binaryPath }: { binaryPath: string }) => {
    probedPaths.push(binaryPath);
    return '0.2.17';
  }),
}));

import { readInstalledCliVersion } from './resolveDoctorRepairReport';

describe('readInstalledCliVersion', () => {
  it('prioritizes canonical kaiwu.exe over older happier.exe on Windows', async () => {
    probedPaths.length = 0;
    const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-doctor-ver-'));
    try {
      const currentDir = join(homeDir, 'cli', 'current');
      const packageDist = join(currentDir, 'package-dist');
      await mkdir(packageDist, { recursive: true });
      const entryPath = join(packageDist, 'index.mjs');
      await writeFile(entryPath, 'export default {};\n');

      const binDir = join(homeDir, 'bin');
      await mkdir(binDir, { recursive: true });
      const primaryShim = join(binDir, 'kaiwu.exe');
      const compatShim = join(binDir, 'happier.exe');
      await writeFile(primaryShim, 'kaiwu-bin');
      await writeFile(compatShim, 'happier-bin');

      const version = readInstalledCliVersion(entryPath, 'win32', {
        happierHomeDir: homeDir,
        releaseChannel: 'stable',
      });
      expect(version).toBe('0.2.17');
      expect(probedPaths).toEqual([primaryShim]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('falls back to happier.exe compatibility shim when kaiwu.exe is absent', async () => {
    probedPaths.length = 0;
    const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-doctor-ver-compat-'));
    try {
      const currentDir = join(homeDir, 'cli', 'current');
      const packageDist = join(currentDir, 'package-dist');
      await mkdir(packageDist, { recursive: true });
      const entryPath = join(packageDist, 'index.mjs');
      await writeFile(entryPath, 'export default {};\n');

      const binDir = join(homeDir, 'bin');
      await mkdir(binDir, { recursive: true });
      const compatShim = join(binDir, 'happier.exe');
      await writeFile(compatShim, 'happier-bin');

      const version = readInstalledCliVersion(entryPath, 'win32', {
        happierHomeDir: homeDir,
        releaseChannel: 'stable',
      });
      expect(version).toBe('0.2.17');
      expect(probedPaths).toEqual([compatShim]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
