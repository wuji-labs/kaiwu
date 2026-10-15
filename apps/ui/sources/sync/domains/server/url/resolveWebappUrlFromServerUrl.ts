export function resolveWebappUrlFromServerUrl(serverUrl: string): string {
    const normalized = String(serverUrl ?? '').trim();
    if (!normalized) return normalized;

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return normalized;
        }
        const origin = parsed.origin.replace(/\/+$/, '');
        if (origin === 'https://api.kaiwu.wujilabs.cn' || origin === 'https://kaiwu.wujilabs.cn') {
            return 'https://kaiwu.wujilabs.cn';
        }
        return origin;
    } catch {
        return normalized;
    }
}

