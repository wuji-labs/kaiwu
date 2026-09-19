import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { resolveConfiguredCliBinaryPath } from './resolveConfiguredCliBinaryPath';

describe('resolveConfiguredCliBinaryPath', () => {
  it('selects the canonical managed bin kaiwu.exe when both aliases exist', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-service-bin-'));
    try {
      const binDir = join(homeDir, 'bin');
      await mkdir(binDir, { recursive: true });
      const kaiwuExe = join(binDir, 'kaiwu.exe');
      const happierExe = join(binDir, 'happier.exe');
      await writeFile(kaiwuExe, 'kaiwu');
      await writeFile(happierExe, 'happier');

      const resolved = resolveConfiguredCliBinaryPath({
        happierHomeDir: homeDir,
        releaseChannel: 'stable',
        platform: 'win32',
      });
      expect(resolved).toBe(kaiwuExe);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('falls back to the managed bin happier.exe compatibility alias when kaiwu.exe is absent', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-service-bin-compat-'));
    try {
      const binDir = join(homeDir, 'bin');
      await mkdir(binDir, { recursive: true });
      const happierExe = join(binDir, 'happier.exe');
      await writeFile(happierExe, 'happier');

      const resolved = resolveConfiguredCliBinaryPath({
        happierHomeDir: homeDir,
        releaseChannel: 'stable',
        platform: 'win32',
      });
      expect(resolved).toBe(happierExe);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('keeps a legacy current payload usable when managed shims are absent', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kaiwu-service-bin-legacy-current-'));
    try {
      const currentDir = join(homeDir, 'cli', 'current');
      await mkdir(currentDir, { recursive: true });
      const happierExe = join(currentDir, 'happier.exe');
      await writeFile(happierExe, 'happier');

      const resolved = resolveConfiguredCliBinaryPath({
        happierHomeDir: homeDir,
        releaseChannel: 'stable',
        platform: 'win32',
      });
      expect(resolved).toBe(happierExe);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('defaults to canonical managed bin kaiwu.exe when no binary exists yet', async () => {
    const homeDir = join(tmpdir(), 'kaiwu-service-bin-empty');
    const expectedKaiwuExe = join(homeDir, 'bin', 'kaiwu.exe');
    const resolved = resolveConfiguredCliBinaryPath({
      happierHomeDir: homeDir,
      releaseChannel: 'stable',
      platform: 'win32',
    });
    expect(resolved).toBe(expectedKaiwuExe);
  });
});
