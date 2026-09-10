import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveHappierGithubRepo } from './_releaseTagsAndRepo';

describe('_releaseTagsAndRepo', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveHappierGithubRepo', () => {
    it('defaults to wuji-labs/kaiwu when no env vars are set', () => {
      delete process.env.KAIWU_GITHUB_REPO;
      delete process.env.HAPPIER_GITHUB_REPO;

      const result = resolveHappierGithubRepo();
      expect(result).toBe('wuji-labs/kaiwu');
    });

    it('prioritizes KAIWU_GITHUB_REPO over HAPPIER_GITHUB_REPO', () => {
      process.env.KAIWU_GITHUB_REPO = 'custom/kaiwu-repo';
      process.env.HAPPIER_GITHUB_REPO = 'old/happier-repo';

      const result = resolveHappierGithubRepo();
      expect(result).toBe('custom/kaiwu-repo');
    });

    it('falls back to HAPPIER_GITHUB_REPO for backward compatibility', () => {
      delete process.env.KAIWU_GITHUB_REPO;
      process.env.HAPPIER_GITHUB_REPO = 'old/happier-repo';

      const result = resolveHappierGithubRepo();
      expect(result).toBe('old/happier-repo');
    });

    it('ignores empty strings and whitespace', () => {
      process.env.KAIWU_GITHUB_REPO = '   ';
      process.env.HAPPIER_GITHUB_REPO = '';

      const result = resolveHappierGithubRepo();
      expect(result).toBe('wuji-labs/kaiwu');
    });

    it('trims whitespace from env var values', () => {
      process.env.KAIWU_GITHUB_REPO = '  custom/repo  ';
      delete process.env.HAPPIER_GITHUB_REPO;

      const result = resolveHappierGithubRepo();
      expect(result).toBe('custom/repo');
    });
  });
});
