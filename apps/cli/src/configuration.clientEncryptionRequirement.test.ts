import { afterEach, describe, expect, it, vi } from 'vitest';

import { restoreProcessEnv, snapshotProcessEnv } from '@/testkit/env/envSnapshot';
import { createTempDirSync, removeTempDirSync } from '@/testkit/fs/tempDir';

describe('configuration client encryption requirement', () => {
  const envBackup = snapshotProcessEnv();
  const tempDirs: string[] = [];

  afterEach(() => {
    restoreProcessEnv(envBackup);
    vi.resetModules();
    for (const tempDir of tempDirs) removeTempDirSync(tempDir);
    tempDirs.length = 0;
  });

  async function loadWith(value: string | undefined) {
    const homeDir = createTempDirSync('happier-cli-config-');
    tempDirs.push(homeDir);
    process.env.HAPPIER_HOME_DIR = homeDir;
    if (value === undefined) delete process.env.HAPPIER_ENCRYPTION_REQUIREMENT;
    else process.env.HAPPIER_ENCRYPTION_REQUIREMENT = value;
    return await import('./configuration');
  }

  it('follows the Account setting when the environment override is absent', async () => {
    const configMod = await loadWith(undefined);
    configMod.reloadConfiguration();
    expect(configMod.configuration.clientEncryptionRequirement).toBe('follow_account');
  });

  it('accepts a force-E2EE environment override', async () => {
    const configMod = await loadWith(' require_e2ee ');
    configMod.reloadConfiguration();
    expect(configMod.configuration.clientEncryptionRequirement).toBe('require_e2ee');
  });

  it('fails loudly for an invalid non-empty override', async () => {
    await expect(loadWith('sometimes')).rejects.toThrow(/HAPPIER_ENCRYPTION_REQUIREMENT/);
  });
});
