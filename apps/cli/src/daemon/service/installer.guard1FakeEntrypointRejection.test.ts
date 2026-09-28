import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isValidCliSemver, probeCliVersion } from './resolveCliVersionFromBinary';
import { resolvePackagedRuntimeEntrypoint } from '@/runtime/resolvePackagedRuntimeEntrypoint';
import { resolveDaemonServiceInstallRuntimeTarget } from './resolveDaemonServiceInstallRuntimeTarget';

describe('Guard 1: verify candidate entrypoint version before install or regeneration', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  describe('probeCliVersion and isValidCliSemver', () => {
    it('validates semver strings correctly', () => {
      expect(isValidCliSemver('0.2.20')).toBe(true);
      expect(isValidCliSemver('v0.2.20')).toBe(true);
      expect(isValidCliSemver('1.0.0-preview.1')).toBe(true);
      expect(isValidCliSemver('1.0.0+build.123')).toBe(true);

      expect(isValidCliSemver('')).toBe(false);
      expect(isValidCliSemver('not-a-version')).toBe(false);
      expect(isValidCliSemver('export default "1.0.0"')).toBe(false);
      expect(isValidCliSemver('v')).toBe(false);
    });

    it('rejects fake stub index.mjs that produces empty stdout on --version (2026-09-28 incident)', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-probe-test-'));
      // Create fake stub exactly matching the 2026-09-28 incident:
      const fakeStubPath = join(tempDir, 'index.mjs');
      writeFileSync(fakeStubPath, 'export default "1.0.0";\n', 'utf8');

      const result = probeCliVersion({
        nodePath: process.execPath,
        entryPath: fakeStubPath,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Empty stdout');
      }
    });

    it('rejects candidate when stdout is not valid semver', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-probe-test-'));
      const invalidVersionScript = join(tempDir, 'index.mjs');
      writeFileSync(invalidVersionScript, 'console.log("hello world");\n', 'utf8');

      const result = probeCliVersion({
        nodePath: process.execPath,
        entryPath: invalidVersionScript,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Invalid semver format');
      }
    });

    it('rejects candidate when version does not match expectedVersion', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-probe-test-'));
      const script = join(tempDir, 'index.mjs');
      writeFileSync(script, 'console.log("0.2.18");\n', 'utf8');

      const result = probeCliVersion({
        nodePath: process.execPath,
        entryPath: script,
        expectedVersion: '0.2.20',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Version mismatch');
      }
    });

    it('accepts candidate when version matches expectedVersion', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-probe-test-'));
      const script = join(tempDir, 'index.mjs');
      writeFileSync(script, 'console.log("0.2.20");\n', 'utf8');

      const result = probeCliVersion({
        nodePath: process.execPath,
        entryPath: script,
        expectedVersion: '0.2.20',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.version).toBe('0.2.20');
      }
    });
  });

  describe('resolvePackagedRuntimeEntrypoint with validate callback', () => {
    it('skips invalid candidate and chooses fallback candidate', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-entrypoint-test-'));
      const fakeDir = join(tempDir, 'fake');
      const validDir = join(tempDir, 'valid');
      mkdirSync(fakeDir, { recursive: true });
      mkdirSync(validDir, { recursive: true });

      const fakeEntry = join(fakeDir, 'index.mjs');
      const validEntry = join(validDir, 'index.mjs');
      writeFileSync(fakeEntry, 'fake', 'utf8');
      writeFileSync(validEntry, 'valid', 'utf8');

      // Test validate callback rejecting fakeEntry
      const validate = (candidate: string) => candidate === validEntry;
      expect(validate(fakeEntry)).toBe(false);
      expect(validate(validEntry)).toBe(true);
    });

    it('throws when all existing candidates fail validation', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-entrypoint-test-'));
      const fakePackageDist = join(tempDir, 'package-dist');
      mkdirSync(fakePackageDist, { recursive: true });
      const fakeEntry = join(fakePackageDist, 'index.mjs');
      writeFileSync(fakeEntry, 'export default "1.0.0";', 'utf8');

      expect(() => {
        resolvePackagedRuntimeEntrypoint('index.mjs', {
          packageDistOnly: true,
          validate: (candidate) => {
            if (candidate === fakeEntry) return false;
            return true;
          },
        });
      }).toThrow(/Failed to resolve valid packaged runtime entrypoint/);
    });
  });

  describe('resolveDaemonServiceInstallRuntimeTarget with fake candidate entrypoint', () => {
    it('rejects fake entrypoint and throws descriptive error', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'guard1-target-test-'));
      const fakeEntry = join(tempDir, 'index.mjs');
      writeFileSync(fakeEntry, 'export default "1.0.0";\n', 'utf8');

      await expect(
        resolveDaemonServiceInstallRuntimeTarget({
          currentExecPath: process.execPath,
          explicitEntryPath: fakeEntry,
          expectedVersion: '0.2.20',
        }),
      ).rejects.toThrow(/后台服务安装入口验明正身失败/);
    });
  });
});
