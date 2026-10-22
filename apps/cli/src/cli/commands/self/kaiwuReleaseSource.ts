/**
 * Kaiwu's own release source. Kaiwu does not publish to npm or GitHub Releases (those package and
 * repository names belong to the upstream project), so version checks and updates go only here.
 */
export const KAIWU_CLI_RELEASE_MANIFEST_URL =
  'https://kaiwu-static.wujilabs.cn/releases/cli/latest.json';
export const KAIWU_INSTALL_SH_URL = 'https://kaiwu.wujilabs.cn/install';
export const KAIWU_INSTALL_PS1_URL = 'https://kaiwu.wujilabs.cn/install.ps1';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function resolveKaiwuInstallCommand(platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? `irm ${KAIWU_INSTALL_PS1_URL} | iex`
    : `curl -fsSL ${KAIWU_INSTALL_SH_URL} | bash`;
}

export async function fetchKaiwuLatestCliVersion(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(KAIWU_CLI_RELEASE_MANIFEST_URL, {
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    const version = typeof body?.version === 'string' ? body.version.trim() : '';
    return VERSION_PATTERN.test(version) ? version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
