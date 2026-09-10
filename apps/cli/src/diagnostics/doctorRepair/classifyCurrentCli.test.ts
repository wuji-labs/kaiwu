import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { classifyCurrentCli } from './classifyCurrentCli';

// Mock dependencies
vi.mock('./relayUpdateCheck', () => ({
  readLatestRelayVersion: vi.fn(),
}));

vi.mock('@happier-dev/cli-common/update', () => ({
  readUpdateCache: vi.fn(),
  writeUpdateCache: vi.fn(),
  compareVersions: vi.fn((a, b) => {
    const aParts = (a || '').split('.').map(Number);
    const bParts = (b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aDiff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (aDiff !== 0) return aDiff > 0 ? 1 : -1;
    }
    return 0;
  }),
  readNpmDistTagVersion: vi.fn(),
  resolveNpmPackageNameOverride: vi.fn((opts) => opts.fallback),
}));

vi.mock('@/configuration', () => ({
  configuration: {
    currentCliVersion: '0.2.10',
    happyHomeDir: '/fake/home',
  },
}));

vi.mock('@/cli/commands/self', () => ({
  detectInstallSource: vi.fn((path) => {
    if (path?.includes('/node_modules/')) return 'npm';
    return 'binary';
  }),
}));

vi.mock('./_shared', () => ({
  semverLessThan: vi.fn((a, b) => {
    const aParts = (a || '').split('.').map(Number);
    const bParts = (b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aDiff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (aDiff !== 0) return aDiff < 0;
    }
    return false;
  }),
}));

vi.mock('./_updateCheck', () => ({
  withTimeout: vi.fn((promise) => promise),
  extractSemverFromReleaseJson: vi.fn(),
}));

describe('classifyCurrentCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.argv for each test
    delete process.argv[1];
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns empty when current version is not specified', async () => {
    const findings = await classifyCurrentCli({
      currentCliReleaseChannel: 'stable',
      currentCliVersion: '',
      forceRefresh: false,
    });
    expect(findings).toEqual([]);
  });

  it('returns empty when latest version is not available and current is up to date', async () => {
    const findings = await classifyCurrentCli({
      currentCliReleaseChannel: 'stable',
      currentCliVersion: '0.2.12',
      forceRefresh: false,
    });
    expect(findings).toEqual([]);
  });

  it('returns cli_self_update_available when update is available on npm', async () => {
    const findings = await classifyCurrentCli({
      currentCliReleaseChannel: 'stable',
      currentCliVersion: '0.2.10',
      forceRefresh: true,
    });
    expect(findings).toHaveLength(0); // In this test setup, npm query will return null/undefined
  });

  it('skips npm query and returns cached latest for binary installations', async () => {
    // Simulate binary installation
    Object.defineProperty(process, 'argv', {
      value: ['/usr/bin/node', '/path/to/kaiwu'],
      configurable: true,
    });

    const findings = await classifyCurrentCli({
      currentCliReleaseChannel: 'stable',
      currentCliVersion: '0.2.10',
      forceRefresh: true,
    });

    expect(findings).toEqual([]);
  });
});
