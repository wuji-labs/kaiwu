/**
 * Kaiwu SCM enrichment 指纹节流：worktree list+脏状态 sha256 指纹、最小间隔、超时 abandon 防毒化；接线在 apps/cli/src/scm/backends/git/repository.ts 与 apps/cli/src/rpc/handlers/scm.ts
 */
export type FingerprintThrottle = Readonly<{
    run: <TValue>(
        key: string,
        readFingerprint: () => Promise<string | null>,
        scan: () => Promise<TValue>,
    ) => Promise<TValue>;
    invalidate: (key?: string) => void;
}>;

type FingerprintThrottleOptions = Readonly<{
    minIntervalMs?: number;
    now?: () => number;
}>;

type CacheEntry<TValue> = Readonly<{
    checkedAtMs: number;
    fingerprint: string | null;
    value: TValue;
}>;

export function createFingerprintThrottle(options: FingerprintThrottleOptions = {}): FingerprintThrottle {
    const minIntervalMs = Math.max(0, Math.floor(options.minIntervalMs ?? 0));
    const now = options.now ?? Date.now;
    const entries = new Map<string, CacheEntry<unknown>>();
    const inFlight = new Map<string, Promise<unknown>>();

    const invalidate = (key?: string): void => {
        if (key === undefined) {
            entries.clear();
            inFlight.clear();
            return;
        }
        entries.delete(key);
        inFlight.delete(key);
    };

    const run = async <TValue>(
        key: string,
        readFingerprint: () => Promise<string | null>,
        scan: () => Promise<TValue>,
    ): Promise<TValue> => {
        const existing = inFlight.get(key);
        if (existing) return await existing as TValue;

        const cached = entries.get(key) as CacheEntry<TValue> | undefined;
        if (cached && now() - cached.checkedAtMs < minIntervalMs) {
            return cached.value;
        }

        const operation = (async (): Promise<TValue> => {
            const fingerprint = await readFingerprint().catch(() => null);
            const current = entries.get(key) as CacheEntry<TValue> | undefined;
            if (current && fingerprint !== null && current.fingerprint === fingerprint) {
                entries.set(key, {
                    checkedAtMs: now(),
                    fingerprint,
                    value: current.value,
                });
                return current.value;
            }

            const value = await scan();
            entries.set(key, {
                checkedAtMs: now(),
                fingerprint,
                value,
            });
            return value;
        })();

        inFlight.set(key, operation);
        try {
            return await operation;
        } finally {
            if (inFlight.get(key) === operation) inFlight.delete(key);
        }
    };

    return { run, invalidate };
}
