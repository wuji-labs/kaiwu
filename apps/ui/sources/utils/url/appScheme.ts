import Constants from 'expo-constants';

function normalizeScheme(raw: unknown): string {
    return String(raw ?? '').trim().toLowerCase();
}

function listConfiguredAppUrlSchemes(): string[] {
    const scheme = Constants.expoConfig?.scheme;
    const entries = typeof scheme === 'string' ? [scheme] : Array.isArray(scheme) ? scheme : [];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const entry of entries) {
        const value = normalizeScheme(entry);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }

    return result;
}

const DEFAULT_APP_URL_SCHEME = 'kaiwu';
const LEGACY_APP_URL_SCHEME = 'happier';

export function resolveAppUrlScheme(): string {
    const configured = listConfiguredAppUrlSchemes()[0];
    if (configured) return configured;
    return DEFAULT_APP_URL_SCHEME;
}

export function resolveAppUrlProtocol(): string {
    return `${resolveAppUrlScheme()}:`;
}

export function listAcceptedHappierUrlSchemes(): readonly string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const scheme of listConfiguredAppUrlSchemes()) {
        const value = normalizeScheme(scheme);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }

    // Always accept the default scheme (links built without a configured scheme use it)
    // and the legacy scheme (links issued before the rename).
    for (const scheme of [DEFAULT_APP_URL_SCHEME, LEGACY_APP_URL_SCHEME]) {
        if (seen.has(scheme)) continue;
        seen.add(scheme);
        result.push(scheme);
    }

    return result;
}

export function isAcceptedHappierUrlProtocol(protocol: string): boolean {
    const normalized = normalizeScheme(String(protocol ?? '').replace(/:$/, ''));
    if (!normalized) return false;
    if (listAcceptedHappierUrlSchemes().includes(normalized)) return true;
    return normalized.startsWith('happier');
}
