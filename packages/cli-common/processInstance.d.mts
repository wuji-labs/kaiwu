export function readProcessInstanceFingerprint(
  pid: number,
  options?: Readonly<{
    platform?: NodeJS.Platform;
    spawnImpl?: typeof import('node:child_process').spawn;
    readFileAsyncImpl?: (path: string, encoding: 'utf8') => Promise<string>;
    timeoutMs?: number;
    cacheTtlMs?: number;
  }>,
): Promise<string | null>;

export function clearProcessInstanceFingerprintCache(): void;

export function readProcessInstanceFingerprintSync(
  pid: number,
  options?: Readonly<{
    platform?: NodeJS.Platform;
    spawnSyncImpl?: typeof import('node:child_process').spawnSync;
    readFileSyncImpl?: typeof import('node:fs').readFileSync;
  }>,
): string | null;

export function processInstanceFingerprintMatches(expected: unknown, observed: unknown): boolean;
