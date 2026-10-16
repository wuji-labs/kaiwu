import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnvKeyScope } from '@/testkit/env/envScope';
import { createTempDirSync, removeTempDirSync } from '@/testkit/fs/tempDir';

describe('configuration legacy hosted server url', () => {
  const envKeys = [
    'HAPPIER_HOME_DIR',
    'HAPPIER_SERVER_URL',
    'HAPPIER_LOCAL_SERVER_URL',
    'HAPPIER_PUBLIC_SERVER_URL',
    'HAPPIER_WEBAPP_URL',
    'HAPPIER_ACTIVE_SERVER_ID',
  ] as const;
  let envScope = createEnvKeyScope(envKeys);
  const tempDirs: string[] = [];

  afterEach(() => {
    envScope.restore();
    envScope = createEnvKeyScope(envKeys);
    vi.resetModules();
    for (const tempDir of tempDirs) removeTempDirSync(tempDir);
    tempDirs.length = 0;
  });

  function useHome(): string {
    const homeDir = createTempDirSync('kaiwu-cli-legacy-host-');
    tempDirs.push(homeDir);
    for (const key of envKeys) delete process.env[key];
    process.env.HAPPIER_HOME_DIR = homeDir;
    return homeDir;
  }

  it('defaults to the current hosted relay when nothing is configured', async () => {
    useHome();
    const configMod = await import('./configuration');
    configMod.reloadConfiguration();
    expect(configMod.configuration.serverUrl).toBe('https://kaiwu.wujilabs.cn');
    expect(configMod.configuration.webappUrl).toBe('https://kaiwu.wujilabs.cn');
  });

  it('keeps the cloud server id but rewrites a persisted legacy hosted url', async () => {
    const homeDir = useHome();
    writeFileSync(
      join(homeDir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 7,
        activeServerId: 'cloud',
        servers: {
          cloud: {
            id: 'cloud',
            name: 'cloud',
            serverUrl: 'https://kaiwu.chengqiyun.com',
            webappUrl: 'https://kaiwu.chengqiyun.com',
            createdAt: 1,
            updatedAt: 1,
            lastUsedAt: 1,
          },
        },
      }),
      'utf8',
    );
    const configMod = await import('./configuration');
    configMod.reloadConfiguration();
    expect(configMod.configuration.activeServerId).toBe('cloud');
    expect(configMod.configuration.serverUrl).toBe('https://kaiwu.wujilabs.cn');
    expect(configMod.configuration.webappUrl).toBe('https://kaiwu.wujilabs.cn');
  });

  it('rewrites a legacy hosted url provided through the environment', async () => {
    useHome();
    process.env.HAPPIER_SERVER_URL = 'https://kaiwu.chengqiyun.com';
    const configMod = await import('./configuration');
    configMod.reloadConfiguration();
    expect(configMod.configuration.serverUrl).toBe('https://kaiwu.wujilabs.cn');
  });
});
