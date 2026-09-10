import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('settings migration v6 -> v7', () => {
  const previousHomeDir = process.env.HAPPIER_HOME_DIR;
  const tempDirs: string[] = [];

  afterEach(() => {
    if (previousHomeDir === undefined) delete process.env.HAPPIER_HOME_DIR;
    else process.env.HAPPIER_HOME_DIR = previousHomeDir;
    vi.resetModules();
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('merges same-address self-hosted server into cloud, removes flfz.org servers, migrates index states', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'happier-cli-migration-v7-'));
    tempDirs.push(homeDir);
    process.env.HAPPIER_HOME_DIR = homeDir;

    // Construct v6 sample with:
    // - cloud: default kaiwu.chengqiyun.com
    // - kaiwu: same address as cloud (with trailing slash), activeServerId points to it, has machineId
    // - wuji: points to flfz.org (should be deleted)
    const v6Settings = {
      schemaVersion: 6,
      onboardingCompleted: true,
      activeServerId: 'kaiwu',  // Pointing to the self-hosted server
      servers: {
        cloud: {
          id: 'cloud',
          name: '无极开物 · 官方中继',
          serverUrl: 'https://kaiwu.chengqiyun.com',
          webappUrl: 'https://kaiwu.chengqiyun.com',
          createdAt: 1000,
          updatedAt: 1000,
          lastUsedAt: 1000,
        },
        kaiwu: {
          id: 'kaiwu',
          name: 'kaiwu self-hosted',
          serverUrl: 'https://kaiwu.chengqiyun.com/',  // Trailing slash, same address
          webappUrl: 'https://kaiwu.chengqiyun.com',
          createdAt: 2000,
          updatedAt: 2000,
          lastUsedAt: 2000,
        },
        wuji: {
          id: 'wuji',
          name: 'WUJI',
          serverUrl: 'https://happier.flfz.org',  // flfz.org domain
          webappUrl: 'https://happier.flfz.org',
          createdAt: 3000,
          updatedAt: 3000,
          lastUsedAt: 3000,
        },
      },
      machineIdByServerId: {
        cloud: 'machine-cloud-id',
        kaiwu: 'machine-kaiwu-id',  // Should migrate to cloud
        wuji: 'machine-wuji-id',    // Should be deleted
      },
      machineIdByServerIdByAccountId: {
        cloud: { 'account-1': 'machine-cloud-account1-id' },
        kaiwu: { 'account-2': 'machine-kaiwu-account2-id' },  // Should migrate to cloud
        wuji: { 'account-3': 'machine-wuji-account3-id' },    // Should be deleted
      },
      machineReplacementCandidatesByServerIdByAccountId: {
        kaiwu: { 'account-2': { machineId: 'old-kaiwu-id', replacementReason: 'retired', createdAt: 2000 } },
        wuji: { 'account-3': { machineId: 'old-wuji-id', replacementReason: 'retired', createdAt: 3000 } },
      },
      lastTokenSubByServerId: {
        cloud: 'token-sub-cloud',
        kaiwu: 'token-sub-kaiwu',  // Should migrate to cloud
        wuji: 'token-sub-wuji',    // Should be deleted
      },
      machineIdConfirmedByServerByServerId: {
        cloud: true,
        kaiwu: false,  // Should migrate to cloud (cloud doesn't have kaiwu's value)
        wuji: true,    // Should be deleted
      },
      lastChangesCursorByServerIdByAccountId: {
        cloud: { 'account-1': 100 },
        kaiwu: { 'account-2': 200 },  // Should migrate to cloud
        wuji: { 'account-3': 300 },   // Should be deleted
      },
    };

    writeFileSync(
      join(homeDir, 'settings.json'),
      JSON.stringify(v6Settings, null, 2),
    );

    vi.resetModules();
    const { readSettings } = await import('./persistence');
    const migrated = await readSettings();

    // Assertions for v7 migration
    expect(migrated.schemaVersion).toBe(7);

    // Only cloud server should remain
    expect(Object.keys(migrated.servers || {})).toEqual(['cloud']);
    expect(migrated.servers?.cloud?.serverUrl).toBe('https://kaiwu.chengqiyun.com');

    // activeServerId should be changed to 'cloud'
    expect(migrated.activeServerId).toBe('cloud');

    // Check machineIdByServerId
    expect(Object.keys(migrated.machineIdByServerId || {})).toEqual(['cloud']);
    // cloud already had a value, so it's preserved (not overwritten by kaiwu's)
    expect((migrated.machineIdByServerId || {}).cloud).toBe('machine-cloud-id');
    expect((migrated.machineIdByServerId || {}).wuji).toBeUndefined();  // Deleted

    // Check machineIdByServerIdByAccountId
    const cloudByAccount = (migrated.machineIdByServerIdByAccountId || {}).cloud || {};
    expect(Object.keys(cloudByAccount)).toContain('account-1');
    expect(Object.keys(cloudByAccount)).toContain('account-2');  // Migrated from kaiwu
    expect((migrated.machineIdByServerIdByAccountId || {}).kaiwu).toBeUndefined();  // Deleted
    expect((migrated.machineIdByServerIdByAccountId || {}).wuji).toBeUndefined();   // Deleted

    // Check machineReplacementCandidatesByServerIdByAccountId
    expect((migrated.machineReplacementCandidatesByServerIdByAccountId || {}).kaiwu).toBeUndefined();
    expect((migrated.machineReplacementCandidatesByServerIdByAccountId || {}).wuji).toBeUndefined();
    const cloudReplacements = (migrated.machineReplacementCandidatesByServerIdByAccountId || {}).cloud || {};
    expect(cloudReplacements['account-2']).toBeDefined();  // Migrated from kaiwu

    // Check lastTokenSubByServerId
    expect(Object.keys(migrated.lastTokenSubByServerId || {})).toEqual(['cloud']);
    // cloud already had a value, so it's preserved (not overwritten by kaiwu's)
    expect((migrated.lastTokenSubByServerId || {}).cloud).toBe('token-sub-cloud');
    expect((migrated.lastTokenSubByServerId || {}).wuji).toBeUndefined();  // Deleted

    // Check machineIdConfirmedByServerByServerId
    expect(Object.keys(migrated.machineIdConfirmedByServerByServerId || {})).toEqual(['cloud']);
    expect((migrated.machineIdConfirmedByServerByServerId || {}).wuji).toBeUndefined();  // Deleted

    // Check lastChangesCursorByServerIdByAccountId
    const cloudCursors = (migrated.lastChangesCursorByServerIdByAccountId || {}).cloud || {};
    expect(Object.keys(cloudCursors)).toContain('account-1');
    expect(Object.keys(cloudCursors)).toContain('account-2');  // Migrated from kaiwu
    expect((migrated.lastChangesCursorByServerIdByAccountId || {}).kaiwu).toBeUndefined();  // Deleted
    expect((migrated.lastChangesCursorByServerIdByAccountId || {}).wuji).toBeUndefined();   // Deleted
  });

  it('is idempotent - running migration on v7 data produces no changes', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'happier-cli-migration-v7-idempotent-'));
    tempDirs.push(homeDir);
    process.env.HAPPIER_HOME_DIR = homeDir;

    // Construct v7 data (already migrated)
    const v7Settings = {
      schemaVersion: 7,
      onboardingCompleted: true,
      activeServerId: 'cloud',
      servers: {
        cloud: {
          id: 'cloud',
          name: '无极开物 · 官方中继',
          serverUrl: 'https://kaiwu.chengqiyun.com',
          webappUrl: 'https://kaiwu.chengqiyun.com',
          createdAt: 1000,
          updatedAt: 1000,
          lastUsedAt: 1000,
        },
      },
      machineIdByServerId: {
        cloud: 'machine-kaiwu-id',
      },
      machineIdByServerIdByAccountId: {
        cloud: { 'account-1': 'machine-cloud-account1-id', 'account-2': 'machine-kaiwu-account2-id' },
      },
      machineReplacementCandidatesByServerIdByAccountId: {
        cloud: { 'account-2': { machineId: 'old-kaiwu-id', replacementReason: 'retired', createdAt: 2000 } },
      },
      lastTokenSubByServerId: {
        cloud: 'token-sub-kaiwu',
      },
      machineIdConfirmedByServerByServerId: {
        cloud: true,
      },
      lastChangesCursorByServerIdByAccountId: {
        cloud: { 'account-1': 100, 'account-2': 200 },
      },
    };

    writeFileSync(
      join(homeDir, 'settings.json'),
      JSON.stringify(v7Settings, null, 2),
    );

    vi.resetModules();
    const { readSettings } = await import('./persistence');
    const afterFirstRead = await readSettings();

    // Write back the result and read again
    writeFileSync(
      join(homeDir, 'settings.json'),
      JSON.stringify(afterFirstRead, null, 2),
    );

    vi.resetModules();
    const afterSecondRead = await readSettings();

    // Should be identical
    expect(afterSecondRead).toEqual(afterFirstRead);
    expect(afterSecondRead.schemaVersion).toBe(7);
  });

  it('handles missing servers gracefully', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'happier-cli-migration-v7-missing-'));
    tempDirs.push(homeDir);
    process.env.HAPPIER_HOME_DIR = homeDir;

    const v6SettingsWithoutServers = {
      schemaVersion: 6,
      onboardingCompleted: false,
    };

    writeFileSync(
      join(homeDir, 'settings.json'),
      JSON.stringify(v6SettingsWithoutServers, null, 2),
    );

    vi.resetModules();
    const { readSettings } = await import('./persistence');
    const migrated = await readSettings();

    // Should migrate to v7 without errors
    expect(migrated.schemaVersion).toBe(7);
  });
});
