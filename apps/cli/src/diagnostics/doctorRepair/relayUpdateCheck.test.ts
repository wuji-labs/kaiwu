import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { withTempDirSync } from '@/testkit/fs/tempDir';
import { readLatestRelayVersion } from './relayUpdateCheck';
import * as configModule from '@/configuration';

// Mock the configuration module
vi.mock('@/configuration', () => ({
  configuration: {
    happyHomeDir: '',
    currentCliVersion: null,
  },
}));

// Mock the GitHub fetch function
vi.mock('@happier-dev/release-runtime/github', () => ({
  fetchGitHubReleaseByTag: vi.fn(),
}));

// Mock the repo resolution
vi.mock('@/capabilities/systemTasks/relayRuntime/_releaseTagsAndRepo', () => ({
  resolveHappierGithubRepo: vi.fn(() => 'wuji-labs/kaiwu'),
  resolveRelayReleaseTag: vi.fn(() => 'server-stable'),
}));

describe('relayUpdateCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes correct updateAvailable flag when comparing versions (newer available)', async () => {
    const { fetchGitHubReleaseByTag } = await import('@happier-dev/release-runtime/github');

    withTempDirSync('relay-update-', async (tempDir) => {
      const cacheDir = join(tempDir, 'cache');
      mkdirSync(cacheDir, { recursive: true });

      // Set configuration mock
      Object.assign(configModule.configuration, {
        happyHomeDir: tempDir,
        currentCliVersion: '0.2.0',
      });

      // Mock fetch to return a newer version
      (fetchGitHubReleaseByTag as any).mockResolvedValue({
        assets: [],
        body: 'Relay server release\nversion: 0.2.5\n',
        tag_name: 'server-stable',
        html_url: 'https://github.com/wuji-labs/kaiwu/releases/tag/server-stable',
      });

      // Call with mocked fetch
      const version = await readLatestRelayVersion('stable', { forceRefresh: true });

      expect(version).toBe('0.2.5');

      // Check cache was written with correct updateAvailable flag
      const cachePath = join(cacheDir, 'update.relay.json');
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      expect(cache.updateAvailable).toBe(true);
      expect(cache.latest).toBe('0.2.5');
      expect(cache.current).toBe('0.2.0');
    });
  });

  it('writes updateAvailable=false when version is same or older', async () => {
    const { fetchGitHubReleaseByTag } = await import('@happier-dev/release-runtime/github');

    withTempDirSync('relay-update-', async (tempDir) => {
      const cacheDir = join(tempDir, 'cache');
      mkdirSync(cacheDir, { recursive: true });

      Object.assign(configModule.configuration, {
        happyHomeDir: tempDir,
        currentCliVersion: '0.2.5',
      });

      (fetchGitHubReleaseByTag as any).mockResolvedValue({
        assets: [],
        body: 'Relay server release\nversion: 0.2.3\n',
        tag_name: 'server-stable',
        html_url: 'https://github.com/wuji-labs/kaiwu/releases/tag/server-stable',
      });

      const version = await readLatestRelayVersion('stable', { forceRefresh: true });

      expect(version).toBe('0.2.3');

      const cachePath = join(cacheDir, 'update.relay.json');
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      expect(cache.updateAvailable).toBe(false);
      expect(cache.latest).toBe('0.2.3');
      expect(cache.current).toBe('0.2.5');
    });
  });

  it('uses configuration.currentCliVersion as fallback when cache has no version', async () => {
    const { fetchGitHubReleaseByTag } = await import('@happier-dev/release-runtime/github');

    withTempDirSync('relay-update-', async (tempDir) => {
      const cacheDir = join(tempDir, 'cache');
      mkdirSync(cacheDir, { recursive: true });

      Object.assign(configModule.configuration, {
        happyHomeDir: tempDir,
        currentCliVersion: '0.1.0',
      });

      (fetchGitHubReleaseByTag as any).mockResolvedValue({
        assets: [],
        body: 'Relay server release\nversion: 0.2.0\n',
        tag_name: 'server-stable',
        html_url: 'https://github.com/wuji-labs/kaiwu/releases/tag/server-stable',
      });

      const version = await readLatestRelayVersion('stable', { forceRefresh: true });

      expect(version).toBe('0.2.0');

      const cachePath = join(cacheDir, 'update.relay.json');
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      expect(cache.current).toBe('0.1.0');
      expect(cache.updateAvailable).toBe(true);
    });
  });
});
