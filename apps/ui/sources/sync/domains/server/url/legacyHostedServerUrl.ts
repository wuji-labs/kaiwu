/**
 * The hosted relay moved from kaiwu.chengqiyun.com to kaiwu.wujilabs.cn on 2026-10-15.
 * Both hostnames are served by the same relay. Persisted profiles that still name a legacy
 * hosted origin are canonicalized to the current one; credentials written under the legacy
 * URL scope remain readable through {@link legacyHostedServerUrlFor}.
 */
export const HOSTED_SERVER_HOSTNAME = 'kaiwu.wujilabs.cn';
export const LEGACY_HOSTED_SERVER_HOSTNAME = 'kaiwu.chengqiyun.com';

const LEGACY_HOSTED_HOSTNAMES: ReadonlySet<string> = new Set([
    LEGACY_HOSTED_SERVER_HOSTNAME,
    'api.chengqiyun.com',
    'app.chengqiyun.com',
]);

export function isLegacyHostedHostname(hostname: string): boolean {
    return LEGACY_HOSTED_HOSTNAMES.has(String(hostname ?? '').toLowerCase().replace(/\.$/, ''));
}

/** The pre-migration URL for a current hosted URL, or null for any other server. */
export function legacyHostedServerUrlFor(normalizedUrl: string): string | null {
    try {
        const parsed = new URL(normalizedUrl);
        if (parsed.hostname.toLowerCase() !== HOSTED_SERVER_HOSTNAME) return null;
        parsed.hostname = LEGACY_HOSTED_SERVER_HOSTNAME;
        return parsed.toString().replace(/\/+$/, '');
    } catch {
        return null;
    }
}
