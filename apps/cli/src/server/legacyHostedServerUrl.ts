/**
 * The hosted relay moved from kaiwu.chengqiyun.com to kaiwu.wujilabs.cn on 2026-10-15.
 * Both hostnames are served by the same relay, so a persisted or env-provided URL that
 * still names an old hosted origin is rewritten to the current one. Credentials and
 * machine ids are keyed by server id, so the rewrite never changes identity.
 */
export const HOSTED_SERVER_ORIGIN = 'https://kaiwu.wujilabs.cn';

const LEGACY_HOSTED_HOSTNAMES: ReadonlySet<string> = new Set([
  'kaiwu.chengqiyun.com',
  'api.chengqiyun.com',
  'app.chengqiyun.com',
]);

export function rewriteLegacyHostedServerUrl(url: string): string {
  const value = String(url ?? '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return value;
    if (!LEGACY_HOSTED_HOSTNAMES.has(parsed.hostname.toLowerCase())) return value;
    const rest = value.slice(parsed.origin.length);
    return `${HOSTED_SERVER_ORIGIN}${rest}`;
  } catch {
    return value;
  }
}
