import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  assertRealHomeDirectoriesUnmodified,
  findProtectedDirectoryViolation,
  installTestHomeDirectoryGuard,
  isTestHomeDirectoryGuardInstalled,
  resolveRealProtectedHomeDirectories,
  uninstallTestHomeDirectoryGuard,
} from './testHomeDirectoryGuard.js';

describe('Guard 3: forbid tests from mutating real home directories (写真实目录就失败)', () => {
  let fakeProtectedDir: string;
  let fakeAllowedDir: string;

  beforeEach(() => {
    fakeProtectedDir = fs.mkdtempSync(join(tmpdir(), 'guard3-fake-protected-'));
    fakeAllowedDir = fs.mkdtempSync(join(tmpdir(), 'guard3-fake-allowed-'));
  });

  afterEach(() => {
    uninstallTestHomeDirectoryGuard();
    try {
      fs.rmSync(fakeProtectedDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
    try {
      fs.rmSync(fakeAllowedDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  });

  describe('findProtectedDirectoryViolation', () => {
    it('detects direct target match and nested paths under protected directories', () => {
      const protectedDirs = [resolve(fakeProtectedDir)];

      expect(findProtectedDirectoryViolation(fakeProtectedDir, protectedDirs)).toBe(resolve(fakeProtectedDir));
      expect(
        findProtectedDirectoryViolation(join(fakeProtectedDir, 'cli', 'current', 'binary'), protectedDirs),
      ).toBe(resolve(fakeProtectedDir));
      expect(
        findProtectedDirectoryViolation(join(fakeProtectedDir, 'test.txt'), protectedDirs),
      ).toBe(resolve(fakeProtectedDir));

      // Path outside protected dir should return null
      expect(findProtectedDirectoryViolation(fakeAllowedDir, protectedDirs)).toBeNull();
      expect(findProtectedDirectoryViolation(join(fakeAllowedDir, 'file.txt'), protectedDirs)).toBeNull();
    });

    it('resolves real protected home directories including .kaiwu and .happier', () => {
      const protectedDirs = resolveRealProtectedHomeDirectories([fakeProtectedDir]);
      expect(protectedDirs.some((dir) => dir.includes('.kaiwu'))).toBe(true);
      expect(protectedDirs.some((dir) => dir.includes('.happier'))).toBe(true);
      expect(protectedDirs.includes(resolve(fakeProtectedDir))).toBe(true);
    });
  });

  describe('intercepted fs operations throw immediately on write to protected directory', () => {
    it('throws immediately when writeFileSync targets a protected directory', () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      expect(isTestHomeDirectoryGuardInstalled()).toBe(true);

      const targetFile = join(fakeProtectedDir, 'polluted.txt');
      expect(() => {
        fs.writeFileSync(targetFile, 'polluting real directory!', 'utf8');
      }).toThrow(/\[GUARD 3 VIOLATION\] Tests are strictly forbidden from writing to real home directories/);

      // Verify the file was never written
      expect(fs.existsSync(targetFile)).toBe(false);
    });

    it('throws immediately when mkdirSync targets a protected directory', () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      const targetSubdir = join(fakeProtectedDir, 'cli', 'versions');
      expect(() => {
        fs.mkdirSync(targetSubdir, { recursive: true });
      }).toThrow(/\[GUARD 3 VIOLATION\]/);

      expect(fs.existsSync(targetSubdir)).toBe(false);
    });

    it('throws immediately when copyFileSync targets a protected directory', () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      const srcFile = join(fakeAllowedDir, 'src.txt');
      const destFile = join(fakeProtectedDir, 'dest.txt');
      // Writing to allowed dir succeeds:
      fs.writeFileSync(srcFile, 'safe', 'utf8');

      expect(() => {
        fs.copyFileSync(srcFile, destFile);
      }).toThrow(/\[GUARD 3 VIOLATION\]/);

      expect(fs.existsSync(destFile)).toBe(false);
    });

    it('rejects immediately when fs.promises.writeFile targets a protected directory', async () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      const targetFile = join(fakeProtectedDir, 'async-polluted.txt');
      await expect(
        fs.promises.writeFile(targetFile, 'async pollute', 'utf8'),
      ).rejects.toThrow(/\[GUARD 3 VIOLATION\]/);

      expect(fs.existsSync(targetFile)).toBe(false);
    });

    it('rejects immediately when fs.promises.mkdir targets a protected directory', async () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      const targetSubdir = join(fakeProtectedDir, 'sub', 'dir');
      await expect(
        fs.promises.mkdir(targetSubdir, { recursive: true }),
      ).rejects.toThrow(/\[GUARD 3 VIOLATION\]/);

      expect(fs.existsSync(targetSubdir)).toBe(false);
    });

    it('allows write operations to isolated temporary directory outside protected paths', async () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      const safeFile = join(fakeAllowedDir, 'safe.txt');
      fs.writeFileSync(safeFile, 'safe content', 'utf8');
      expect(fs.readFileSync(safeFile, 'utf8')).toBe('safe content');

      const safeAsyncFile = join(fakeAllowedDir, 'safe-async.txt');
      await fs.promises.writeFile(safeAsyncFile, 'safe async', 'utf8');
      expect(await fs.promises.readFile(safeAsyncFile, 'utf8')).toBe('safe async');
    });
  });

  describe('assertRealHomeDirectoriesUnmodified detects mtime mutations', () => {
    it('passes assertion when protected directories are not modified', () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
      });

      expect(() => {
        assertRealHomeDirectoriesUnmodified();
      }).not.toThrow();
    });

    it('throws violation error if protected directory mtime changed during test', () => {
      installTestHomeDirectoryGuard({
        extraProtectedDirs: [fakeProtectedDir],
        isolatedHomeDir: fakeAllowedDir,
        enableFsInterception: false, // Bypass interception to test the post-test mtime check
      });

      // Directly touch the directory's mtime (simulating an external or bypass modification)
      const futureTime = new Date(Date.now() + 100_000);
      fs.utimesSync(fakeProtectedDir, futureTime, futureTime);

      expect(() => {
        assertRealHomeDirectoriesUnmodified();
      }).toThrow(/\[GUARD 3 VIOLATION\] Protected real home directory was modified during test \(mtime changed\)/);
    });
  });
});
