import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import {
  resetHappyHomeDirWarningsForTests,
  resolveHappyHomeDirFromEnvironment,
} from './resolveHappyHomeDir.js';

function resolveOriginalPlatformDescriptor(): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  if (!descriptor) {
    throw new Error('process.platform descriptor is unavailable');
  }
  return descriptor;
}
const originalPlatformDescriptor: PropertyDescriptor = resolveOriginalPlatformDescriptor();

function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  Object.defineProperty(process, 'platform', { ...originalPlatformDescriptor, value: platform });
  try {
    fn();
  } finally {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
}

describe('resolveHappyHomeDirFromEnvironment', () => {
  beforeEach(() => {
    resetHappyHomeDirWarningsForTests();
  });

  it('returns an absolute override path unchanged', () => {
    expect(resolveHappyHomeDirFromEnvironment({ HAPPIER_HOME_DIR: '/tmp/happier-home' })).toBe('/tmp/happier-home');
    expect(resolveHappyHomeDirFromEnvironment({ KAIWU_HOME_DIR: '/tmp/kaiwu-home' })).toBe('/tmp/kaiwu-home');
  });

  it('prioritizes KAIWU_HOME_DIR over HAPPIER_HOME_DIR', () => {
    expect(resolveHappyHomeDirFromEnvironment({
      KAIWU_HOME_DIR: '/tmp/kaiwu-home',
      HAPPIER_HOME_DIR: '/tmp/happier-home',
    })).toBe('/tmp/kaiwu-home');
  });

  it('expands ~/ override paths against the configured home directory', () => {
    expect(resolveHappyHomeDirFromEnvironment({
      KAIWU_HOME_DIR: '~/custom-kaiwu-home',
      HOME: '/Users/tester',
    })).toBe('/Users/tester/custom-kaiwu-home');
  });

  it('resolves relative override paths to absolute paths', () => {
    expect(resolveHappyHomeDirFromEnvironment({ KAIWU_HOME_DIR: 'relative-home' })).toBe(resolvePath('relative-home'));
  });

  it('preserves Windows-shaped absolute overrides on Windows', () => {
    withPlatform('win32', () => {
      expect(resolveHappyHomeDirFromEnvironment({
        KAIWU_HOME_DIR: 'C:\\Users\\tester\\.kaiwu-custom',
        USERPROFILE: 'C:\\Users\\tester',
      })).toBe('C:\\Users\\tester\\.kaiwu-custom');
    });
  });

  it('rejects Windows-shaped absolute overrides on non-Windows hosts', () => {
    withPlatform('darwin', () => {
      expect(() => resolveHappyHomeDirFromEnvironment({
        KAIWU_HOME_DIR: 'C:\\Users\\tester\\.kaiwu-custom',
        HOME: '/Users/tester',
      })).toThrow(/windows/i);
    });
  });

  describe('default user directory resolution (~/.kaiwu primary, ~/.happier fallback)', () => {
    it('resolves to ~/.kaiwu when only ~/.kaiwu exists, emitting no warning', () => {
      const tempHome = mkdtempSync(join(tmpdir(), 'kw-home-test-1-'));
      try {
        mkdirSync(join(tempHome, '.kaiwu'));
        const warn = vi.fn();
        const resolved = resolveHappyHomeDirFromEnvironment({ HOME: tempHome }, { warn });
        expect(resolved).toBe(join(tempHome, '.kaiwu'));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
      }
    });

    it('resolves to ~/.happier when only ~/.happier exists, emitting one-time deprecation warning', () => {
      const tempHome = mkdtempSync(join(tmpdir(), 'kw-home-test-2-'));
      try {
        mkdirSync(join(tempHome, '.happier'));
        const warn = vi.fn();
        const resolved = resolveHappyHomeDirFromEnvironment({ HOME: tempHome }, { warn });
        expect(resolved).toBe(join(tempHome, '.happier'));
        expect(warn).toHaveBeenCalledWith('[kaiwu] ~/.happier is deprecated, use ~/.kaiwu');
        expect(warn).toHaveBeenCalledTimes(1);

        // Calling a second time should not warn again
        const resolved2 = resolveHappyHomeDirFromEnvironment({ HOME: tempHome }, { warn });
        expect(resolved2).toBe(join(tempHome, '.happier'));
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
      }
    });

    it('resolves to ~/.kaiwu when both ~/.kaiwu and ~/.happier exist, emitting no warning', () => {
      const tempHome = mkdtempSync(join(tmpdir(), 'kw-home-test-3-'));
      try {
        mkdirSync(join(tempHome, '.kaiwu'));
        mkdirSync(join(tempHome, '.happier'));
        const warn = vi.fn();
        const resolved = resolveHappyHomeDirFromEnvironment({ HOME: tempHome }, { warn });
        expect(resolved).toBe(join(tempHome, '.kaiwu'));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
      }
    });

    it('defaults to ~/.kaiwu when neither exists', () => {
      const tempHome = mkdtempSync(join(tmpdir(), 'kw-home-test-4-'));
      try {
        const warn = vi.fn();
        const resolved = resolveHappyHomeDirFromEnvironment({ HOME: tempHome }, { warn });
        expect(resolved).toBe(join(tempHome, '.kaiwu'));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
      }
    });
  });
});
