const STATIC_EXPO_PUBLIC_HAPPIER_CRYPTO_JSON_DECRYPT_WORKER_THRESHOLD_BYTES =
    process.env.EXPO_PUBLIC_HAPPIER_CRYPTO_JSON_DECRYPT_WORKER_THRESHOLD_BYTES;

const DEFAULT_LARGE_PAYLOAD_THRESHOLD_BYTES = 256 * 1024;
const DEFAULT_WORKER_TIMEOUT_MS = 60_000;
const WORKER_SCRIPT_PATH = '/kaiwu-crypto-json-worker.js';
const FALLBACK_WORKER_SCRIPT_PATH = '/happier-crypto-json-worker.js';

export type AesGcmJsonWebWorkerOptions = Readonly<{
    largePayloadThresholdBytes?: number;
    requestTimeoutMs?: number;
    workerFactory?: () => Worker;
}>;

type WorkerResponse = Readonly<{
    id?: unknown;
    status?: unknown;
    items?: unknown;
    error?: unknown;
}>;

type PendingRequest = {
    resolve: (items: Array<unknown | null>) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

let cachedWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function readEnvThreshold(): number | null {
    const raw = STATIC_EXPO_PUBLIC_HAPPIER_CRYPTO_JSON_DECRYPT_WORKER_THRESHOLD_BYTES;
    if (typeof raw !== 'string' || raw.trim().length === 0) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

export function normalizeLargeJsonDecryptPayloadBytes(value: number | null | undefined): number {
    const candidate = typeof value === 'number' ? value : readEnvThreshold();
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        return DEFAULT_LARGE_PAYLOAD_THRESHOLD_BYTES;
    }
    return Math.max(1, Math.trunc(candidate));
}

export function estimateBase64DecodedBytes(value: string): number {
    const compact = value.replace(/\s+/g, '');
    if (compact.length === 0) return 0;
    const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function getWorkerBaseHref(): string {
    if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
        return window.location.origin;
    }
    if (typeof document !== 'undefined' && typeof document.baseURI === 'string') {
        return document.baseURI;
    }
    return 'http://localhost';
}

function createDefaultWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null;
    try {
        return new Worker(new URL(WORKER_SCRIPT_PATH, getWorkerBaseHref()), { type: 'module' });
    } catch (primaryError) {
        // Fall back to legacy happier worker if kaiwu worker is not available
        try {
            return new Worker(new URL(FALLBACK_WORKER_SCRIPT_PATH, getWorkerBaseHref()), { type: 'module' });
        } catch {
            return null;
        }
    }
}

function rejectAllPending(error: Error): void {
    for (const [id, pending] of pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        pendingRequests.delete(id);
    }
}

function normalizeWorkerItems(value: unknown): Array<unknown | null> | null {
    if (!Array.isArray(value)) return null;
    return value.map((item) => item === null ? null : item);
}

function handleWorkerMessage(event: MessageEvent): void {
    const response = event.data as WorkerResponse;
    if (typeof response.id !== 'number') return;
    const pending = pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pendingRequests.delete(response.id);

    if (response.status !== 'ok') {
        pending.reject(new Error('web AES-GCM JSON decrypt worker failed'));
        return;
    }

    const items = normalizeWorkerItems(response.items);
    if (!items) {
        pending.reject(new Error('web AES-GCM JSON decrypt worker returned invalid items'));
        return;
    }

    pending.resolve(items);
}

function attachWorkerHandlers(worker: Worker): void {
    worker.onmessage = handleWorkerMessage;
    worker.onerror = () => {
        rejectAllPending(new Error('web AES-GCM JSON decrypt worker errored'));
    };
}

function getWorker(options: AesGcmJsonWebWorkerOptions): Worker | null {
    if (options.workerFactory) {
        try {
            const worker = options.workerFactory();
            attachWorkerHandlers(worker);
            return worker;
        } catch {
            return null;
        }
    }

    if (!cachedWorker) {
        cachedWorker = createDefaultWorker();
        if (cachedWorker) {
            attachWorkerHandlers(cachedWorker);
        }
    }
    return cachedWorker;
}

export async function decryptAesGcmJsonBase64BatchWithWebWorker(
    encryptedPayloadBase64: readonly string[],
    keyBase64: string,
    options: AesGcmJsonWebWorkerOptions = {},
): Promise<Array<unknown | null> | null> {
    if (encryptedPayloadBase64.length === 0) return [];
    const worker = getWorker(options);
    if (!worker) return null;

    const id = nextRequestId++;
    const timeoutMs = Math.max(1, Math.trunc(options.requestTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS));

    return await new Promise<Array<unknown | null> | null>((resolve) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            resolve(null);
        }, timeoutMs);

        pendingRequests.set(id, {
            resolve: (items) => resolve(items),
            reject: () => resolve(null),
            timeout,
        });

        try {
            worker.postMessage({
                id,
                type: 'decryptAesGcmJsonBatch',
                keyBase64,
                items: encryptedPayloadBase64,
            });
        } catch {
            clearTimeout(timeout);
            pendingRequests.delete(id);
            resolve(null);
        }
    });
}

export function resetWebJsonDecryptWorkerForTests(): void {
    for (const pending of pendingRequests.values()) {
        clearTimeout(pending.timeout);
    }
    pendingRequests.clear();
    cachedWorker?.terminate();
    cachedWorker = null;
    nextRequestId = 1;
}
