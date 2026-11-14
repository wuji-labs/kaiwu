import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeDistExecutableWrapper } from './writeDistExecutableWrapper.js';

describe('writeDistExecutableWrapper', () => {
  it('writes an executable dist wrapper that targets the compiled hsetup entrypoint', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hsetup-wrapper-'));
    const targetPath = join(rootDir, 'dist', 'bin', 'hsetup');

    try {
      await writeDistExecutableWrapper({
        targetPath,
      });

      const contents = readFileSync(targetPath, 'utf8');
      expect(contents).toContain("new URL('./hsetup.js', import.meta.url)");
      expect(contents.startsWith('#!/usr/bin/env node\n')).toBe(true);
      if (process.platform === 'win32') {
        // Windows has no POSIX exec bits (fs reports 0o666/0o444 only); the wrapper is launched via
        // its node shebang by package-manager shims, so the observable contract is "not read-only".
        expect(statSync(targetPath).mode & 0o200).toBe(0o200);
      } else {
        expect(statSync(targetPath).mode & 0o777).toBe(0o755);
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
