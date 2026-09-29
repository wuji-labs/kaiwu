import { afterEach, describe, expect, it } from 'vitest';
import fs, { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertRealHomeDirectoriesUnmodified,
  findProtectedDirectoryViolation,
  installTestHomeDirectoryGuard,
  resolveRealProtectedHomeDirectories,
  uninstallTestHomeDirectoryGuard,
} from '@happier-dev/cli-common/fs/testHomeDirectoryGuard';

describe('Guard 3: forbid tests from mutating real home directories (写真实目录就失败)', () => {
  let fakeRealHomeDir: string | null = null;

  afterEach(() => {
    uninstallTestHomeDirectoryGuard();
    if (fakeRealHomeDir) {
      try {
        rmSync(fakeRealHomeDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      fakeRealHomeDir = null;
    }
  });

  it('rejects synchronous write to real home directory with violation error', () => {
    fakeRealHomeDir = mkdtempSync(join(tmpdir(), 'guard3-fake-home-'));
    installTestHomeDirectoryGuard({
      extraProtectedDirs: [fakeRealHomeDir],
    });

    const targetFile = join(fakeRealHomeDir, 'accidental-pollute.txt');
    expect(() => {
      fs.writeFileSync(targetFile, 'polluting real directory!', 'utf8');
    }).toThrow(/\[GUARD 3 VIOLATION\] Tests are strictly forbidden from writing to real home directories/);

    expect(existsSync(targetFile)).toBe(false);
  });

  it('fails test via assertRealHomeDirectoriesUnmodified when protected directory is mutated', () => {
    fakeRealHomeDir = mkdtempSync(join(tmpdir(), 'guard3-fake-mtime-'));
    installTestHomeDirectoryGuard({
      extraProtectedDirs: [fakeRealHomeDir],
      enableFsInterception: false,
    });

    // Touch mtime of the protected directory
    const futureTime = new Date(Date.now() + 100_000);
    fs.utimesSync(fakeRealHomeDir, futureTime, futureTime);

    expect(() => {
      assertRealHomeDirectoriesUnmodified();
    }).toThrow(/\[GUARD 3 VIOLATION\] Protected real home directory was modified during test \(mtime changed\)/);
  });

  it('detects violations in protected home directories including .kaiwu and .happier', () => {
    const protectedDirs = resolveRealProtectedHomeDirectories();
    expect(protectedDirs.length).toBeGreaterThan(0);

    for (const dir of protectedDirs) {
      expect(findProtectedDirectoryViolation(dir, protectedDirs)).toBe(dir);
      expect(findProtectedDirectoryViolation(join(dir, 'test-file.txt'), protectedDirs)).toBe(dir);
      expect(findProtectedDirectoryViolation(join(dir, 'cli', 'current', 'binary'), protectedDirs)).toBe(dir);
    }
  });
});
