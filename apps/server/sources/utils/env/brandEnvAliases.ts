/**
 * Kaiwu was rebranded from Happier. Server modules currently read a mix of canonical
 * `KAIWU_*` names and legacy `HAPPIER_*` names, so a deployment configured with only one
 * prefix could have settings silently ignored by modules reading the other.
 *
 * `applyBrandEnvAliases` mirrors every `KAIWU_*` / `HAPPIER_*` pair in place so both
 * spellings resolve to the same value everywhere:
 * - `KAIWU_*` is canonical and always wins (its value is mirrored onto the legacy name);
 * - a `HAPPIER_*` value is promoted to `KAIWU_*` only when the canonical name is unset,
 *   and is reported in `legacyKeysUsed` so callers can surface a deprecation notice.
 */
const CANONICAL_PREFIX = 'KAIWU_';
const LEGACY_PREFIX = 'HAPPIER_';

export type BrandEnvAliasResult = Readonly<{
    legacyKeysUsed: readonly string[];
}>;

export function applyBrandEnvAliases(env: NodeJS.ProcessEnv): BrandEnvAliasResult {
    const snapshot: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) snapshot[key] = value;
    }

    const legacyKeysUsed: string[] = [];
    for (const [key, value] of Object.entries(snapshot)) {
        if (key.startsWith(CANONICAL_PREFIX)) {
            env[LEGACY_PREFIX + key.slice(CANONICAL_PREFIX.length)] = value;
            continue;
        }
        if (key.startsWith(LEGACY_PREFIX)) {
            const canonicalKey = CANONICAL_PREFIX + key.slice(LEGACY_PREFIX.length);
            if (snapshot[canonicalKey] === undefined) {
                env[canonicalKey] = value;
                legacyKeysUsed.push(key);
            }
        }
    }

    legacyKeysUsed.sort();
    return { legacyKeysUsed };
}

export function formatLegacyBrandEnvNotice(legacyKeysUsed: readonly string[]): string | null {
    if (legacyKeysUsed.length === 0) return null;
    return `[kaiwu] Legacy HAPPIER_* environment variables detected (${legacyKeysUsed.join(', ')}); `
        + 'they are mapped to KAIWU_* for compatibility. Please rename them to the KAIWU_ prefix.';
}
