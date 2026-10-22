import { describe, expect, it } from 'vitest';

import { fetchKaiwuLatestCliVersion, KAIWU_CLI_RELEASE_MANIFEST_URL, resolveKaiwuInstallCommand } from './kaiwuReleaseSource';

describe('kaiwuReleaseSource', () => {
  it('reads the version from our own release manifest only', async () => {
    const seen: string[] = [];
    const fakeFetch = (async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ version: '0.2.28' }));
    }) as unknown as typeof fetch;
    await expect(fetchKaiwuLatestCliVersion(fakeFetch)).resolves.toBe('0.2.28');
    expect(KAIWU_CLI_RELEASE_MANIFEST_URL).toBe('https://kaiwu-static.wujilabs.cn/releases/cli/latest.json');
    expect(seen).toEqual([KAIWU_CLI_RELEASE_MANIFEST_URL]);
    expect(seen.join()).not.toMatch(/npmjs|github|happier\.dev/);
  });

  it('returns null for unreachable or malformed manifests', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const malformed = (async () => new Response(JSON.stringify({ version: 'latest; rm -rf /' }))) as unknown as typeof fetch;
    await expect(fetchKaiwuLatestCliVersion(failing)).resolves.toBeNull();
    await expect(fetchKaiwuLatestCliVersion(malformed)).resolves.toBeNull();
  });

  it('updates through the official installer of our domain', () => {
    expect(resolveKaiwuInstallCommand('win32')).toBe('irm https://kaiwu.wujilabs.cn/install.ps1 | iex');
    expect(resolveKaiwuInstallCommand('darwin')).toBe('curl -fsSL https://kaiwu.wujilabs.cn/install | bash');
  });
});
