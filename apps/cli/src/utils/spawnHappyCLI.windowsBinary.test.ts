import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveSiblingWindowsPackagedBinary } from './spawnHappyCLI';

describe('resolveSiblingWindowsPackagedBinary', () => {
  it('prefers kaiwu.exe over happier.exe when both exist beside package-dist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kaiwu-win-binary-'));
    try {
      const packageDist = join(root, 'package-dist');
      await mkdir(packageDist, { recursive: true });
      const entrypoint = join(packageDist, 'index.mjs');
      await writeFile(entrypoint, 'export default {};\n', 'utf8');

      const kaiwuExe = join(root, 'kaiwu.exe');
      const happierExe = join(root, 'happier.exe');
      await writeFile(kaiwuExe, 'kaiwu-bin', 'utf8');
      await writeFile(happierExe, 'happier-bin', 'utf8');

      const resolved = resolveSiblingWindowsPackagedBinary(entrypoint);
      expect(resolved).toBe(kaiwuExe);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to happier.exe compatibility alias when kaiwu.exe is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kaiwu-win-binary-compat-'));
    try {
      const packageDist = join(root, 'package-dist');
      await mkdir(packageDist, { recursive: true });
      const entrypoint = join(packageDist, 'index.mjs');
      await writeFile(entrypoint, 'export default {};\n', 'utf8');

      const happierExe = join(root, 'happier.exe');
      await writeFile(happierExe, 'happier-bin', 'utf8');

      const resolved = resolveSiblingWindowsPackagedBinary(entrypoint);
      expect(resolved).toBe(happierExe);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
