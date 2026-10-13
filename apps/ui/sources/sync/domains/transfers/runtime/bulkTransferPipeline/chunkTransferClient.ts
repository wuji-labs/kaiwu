import {
    createEncryptedTransferChunkEnvelope,
    decryptEncryptedTransferChunkEnvelope,
} from './transferChunkEncryption';
import { decodeBase64 } from '@/encryption/base64';
import { delay } from '@/utils/timing/time';
import {
    isRuntimeActive,
    subscribeToRuntimeActiveChange,
    waitForRuntimeActive,
} from '@/utils/runtime/isRuntimeActive';

export type ChunkUploadProgress = Readonly<{
    uploadedBytes: number;
    totalBytes: number;
}>;

async function runUploadRpcWithLifecycleRecovery<TResponse extends { success: boolean }>(
    operation: () => Promise<TResponse>,
): Promise<TResponse> {
    while (true) {
        await waitForRuntimeActive();

        let interruptedByLifecycle = false;
        const detachLifecycle = subscribeToRuntimeActiveChange(() => {
            if (!isRuntimeActive()) {
                interruptedByLifecycle = true;
            }
        });

        try {
            const response = await operation();
            if (response?.success !== true && (interruptedByLifecycle || !isRuntimeActive())) {
                await waitForRuntimeActive();
                continue;
            }
            return response;
        } catch (error) {
            if (interruptedByLifecycle || !isRuntimeActive()) {
                await waitForRuntimeActive();
                continue;
            }
            throw error;
        } finally {
            detachLifecycle();
        }
    }
}

export const OBJECT_STORE_RELAY_KIND = 'presigned_put_v1';

const OBJECT_STORE_PUT_CONCURRENCY = 4;
const OBJECT_STORE_PUT_ATTEMPTS = 3;

export type ObjectStoreRelayDescriptor = Readonly<{
    kind: typeof OBJECT_STORE_RELAY_KIND;
    putUrls: ReadonlyArray<string>;
}>;

export type ObjectStorePut = (url: string, body: Uint8Array, signal: AbortSignal | null) => Promise<void>;

export type UploadChunkRequest = Readonly<{
    uploadId: string;
    index: number;
    payloadBase64: string;
    encryptedDataKeyEnvelopeBase64: string;
    objectStored?: true;
}>;

export type UploadInitOptions = Readonly<{
    objectStoreRelay?: typeof OBJECT_STORE_RELAY_KIND;
}>;

const defaultObjectStorePut: ObjectStorePut = async (url, body, signal) => {
    const response = await fetch(url, {
        method: 'PUT',
        body: body as unknown as BodyInit,
        headers: { 'content-type': 'application/octet-stream' },
        signal: signal ?? undefined,
    });
    if (!response.ok) {
        throw new Error(`Object store upload failed (${response.status})`);
    }
};

/**
 * Object-store chunk frame: [u32 BE envelope length][encrypted data key envelope][encrypted payload].
 * Mirrors the daemon's decodeTransferObjectChunkFrame.
 */
export function encodeObjectStoreChunkFrame(encrypted: Readonly<{
    payloadBase64: string;
    encryptedDataKeyEnvelopeBase64: string;
}>): Uint8Array {
    const envelope = decodeBase64(encrypted.encryptedDataKeyEnvelopeBase64);
    const payload = decodeBase64(encrypted.payloadBase64);
    const frame = new Uint8Array(4 + envelope.byteLength + payload.byteLength);
    new DataView(frame.buffer).setUint32(0, envelope.byteLength, false);
    frame.set(envelope, 4);
    frame.set(payload, 4 + envelope.byteLength);
    return frame;
}

function readObjectStoreRelay(init: unknown, expectedChunkCount: number): ObjectStoreRelayDescriptor | null {
    const relay = (init as { objectStore?: unknown } | null)?.objectStore as { kind?: unknown; putUrls?: unknown } | undefined;
    if (!relay || relay.kind !== OBJECT_STORE_RELAY_KIND || !Array.isArray(relay.putUrls)) return null;
    if (relay.putUrls.length !== expectedChunkCount) return null;
    if (!relay.putUrls.every((url) => typeof url === 'string' && url.startsWith('https://'))) return null;
    return relay as ObjectStoreRelayDescriptor;
}

class ObjectStoreRelayError extends Error {}

type UploadInChunksParams<TInit, TChunk, TFinalize> = Readonly<{
    totalBytes: number;
    readBytes: (offset: number, length: number) => Promise<Uint8Array>;
    init: (options: UploadInitOptions) => Promise<TInit>;
    sendChunk: (request: UploadChunkRequest) => Promise<TChunk>;
    finalize: (request: Readonly<{ uploadId: string }>) => Promise<TFinalize>;
    abort?: ((request: Readonly<{ uploadId: string }>) => Promise<unknown>) | null;
    onProgress?: ((progress: ChunkUploadProgress) => void) | null;
    signal?: AbortSignal | null;
    /** Opt in to the daemon's object-store relay (large uploads bypass the relay server's egress). */
    allowObjectStoreRelay?: boolean;
    objectStorePut?: ObjectStorePut | null;
}>;

type UploadInitShape = {
    success: boolean;
    uploadId?: string;
    chunkSizeBytes?: number;
    recipientPublicKeyBase64?: string;
    error?: string;
};

export async function uploadInChunks<
    TInit extends UploadInitShape,
    TChunk extends { success: boolean; error?: string },
    TFinalize extends { success: boolean; error?: string },
>(params: UploadInChunksParams<TInit, TChunk, TFinalize>): Promise<TFinalize | { success: false; error: string }> {
    if (params.allowObjectStoreRelay === true) {
        const relayed = await uploadInChunksOnce(params, true);
        if (!relayed.relayFailed || params.signal?.aborted) {
            return relayed.result;
        }
        // The object store was unreachable from this client: redo the whole upload over RPC.
    }
    return (await uploadInChunksOnce(params, false)).result;
}

async function uploadInChunksOnce<
    TInit extends UploadInitShape,
    TChunk extends { success: boolean; error?: string },
    TFinalize extends { success: boolean; error?: string },
>(
    params: UploadInChunksParams<TInit, TChunk, TFinalize>,
    requestObjectStoreRelay: boolean,
): Promise<Readonly<{ result: TFinalize | { success: false; error: string }; relayFailed: boolean }>> {
    let uploadId: string | null = null;
    const done = (result: TFinalize | { success: false; error: string }) => ({ result, relayFailed: false });

    try {
        const init = await runUploadRpcWithLifecycleRecovery(() => params.init(
            requestObjectStoreRelay ? { objectStoreRelay: OBJECT_STORE_RELAY_KIND } : {},
        ));
        if (!init || typeof init !== 'object' || init.success !== true) {
            const error = typeof (init as any)?.error === 'string' ? (init as any).error : 'Upload init failed';
            return done({ success: false, error });
        }

        const initUploadId = (init as any)?.uploadId;
        const chunkSizeBytes = (init as any)?.chunkSizeBytes;
        const recipientPublicKeyBase64 = (init as any)?.recipientPublicKeyBase64;
        if (typeof initUploadId !== 'string' || !initUploadId.trim()) {
            return done({ success: false, error: 'Upload init returned no uploadId' });
        }
        if (typeof chunkSizeBytes !== 'number' || !Number.isFinite(chunkSizeBytes) || chunkSizeBytes <= 0) {
            return done({ success: false, error: 'Upload init returned invalid chunkSizeBytes' });
        }
        if (typeof recipientPublicKeyBase64 !== 'string' || !recipientPublicKeyBase64.trim()) {
            return done({ success: false, error: 'Upload init returned no recipientPublicKeyBase64' });
        }

        uploadId = initUploadId;
        const currentUploadId = initUploadId;
        const emitProgress = (uploadedBytes: number) => {
            if (!params.onProgress) return;
            try {
                params.onProgress({ uploadedBytes, totalBytes: params.totalBytes });
            } catch {
                // ignore
            }
        };

        const encryptChunk = async (index: number) => {
            const offset = index * chunkSizeBytes;
            const length = Math.min(chunkSizeBytes, params.totalBytes - offset);
            const chunkBytes = await params.readBytes(offset, length);
            if (chunkBytes.byteLength !== length) {
                throw new Error('Failed to read upload chunk');
            }
            let encrypted: Awaited<ReturnType<typeof createEncryptedTransferChunkEnvelope>>;
            try {
                encrypted = await createEncryptedTransferChunkEnvelope({
                    transferId: currentUploadId,
                    sequence: index,
                    payload: chunkBytes,
                    recipientPublicKeyBase64,
                });
            } catch {
                throw new Error('Upload chunk encryption failed');
            }
            return { encrypted, plainBytes: chunkBytes.byteLength };
        };

        const chunkCount = Math.ceil(params.totalBytes / chunkSizeBytes);
        const relay = requestObjectStoreRelay ? readObjectStoreRelay(init, chunkCount) : null;
        let uploadedBytes = 0;

        if (relay) {
            const relayFailure = await uploadChunksViaObjectStore({
                relay,
                chunkCount,
                encryptChunk,
                put: params.objectStorePut ?? defaultObjectStorePut,
                signal: params.signal ?? null,
                notify: async (index) => {
                    const chunk = await runUploadRpcWithLifecycleRecovery(() => params.sendChunk({
                        uploadId: currentUploadId,
                        index,
                        payloadBase64: '',
                        encryptedDataKeyEnvelopeBase64: '',
                        objectStored: true,
                    }));
                    if (!chunk || typeof chunk !== 'object' || (chunk as any).success !== true) {
                        const error = typeof (chunk as any)?.error === 'string' ? (chunk as any).error : 'Upload chunk failed';
                        throw new ObjectStoreRelayError(error);
                    }
                },
                onChunkCommitted: (plainBytes) => {
                    uploadedBytes += plainBytes;
                    emitProgress(uploadedBytes);
                },
            });
            if (relayFailure) {
                return relayFailure;
            }
        } else {
            for (let index = 0; index < chunkCount; index += 1) {
                if (params.signal?.aborted) {
                    return done({ success: false, error: 'Upload canceled' });
                }

                let prepared: Awaited<ReturnType<typeof encryptChunk>>;
                try {
                    prepared = await encryptChunk(index);
                } catch (error) {
                    return done({ success: false, error: error instanceof Error ? error.message : 'Upload chunk failed' });
                }

                const chunk = await runUploadRpcWithLifecycleRecovery(() => params.sendChunk({
                    uploadId: currentUploadId,
                    index,
                    payloadBase64: prepared.encrypted.payloadBase64,
                    encryptedDataKeyEnvelopeBase64: prepared.encrypted.encryptedDataKeyEnvelopeBase64,
                }));
                if (!chunk || typeof chunk !== 'object' || (chunk as any).success !== true) {
                    const error = typeof (chunk as any)?.error === 'string' ? (chunk as any).error : 'Upload chunk failed';
                    return done({ success: false, error });
                }

                uploadedBytes += prepared.plainBytes;
                emitProgress(uploadedBytes);
            }
        }

        const finalized = await runUploadRpcWithLifecycleRecovery(() => params.finalize({ uploadId: currentUploadId }));
        if (!finalized || typeof finalized !== 'object' || (finalized as any).success !== true) {
            const error = typeof (finalized as any)?.error === 'string' ? (finalized as any).error : 'Upload finalize failed';
            return done({ success: false, error });
        }

        uploadId = null;
        return done(finalized);
    } finally {
        if (uploadId) {
            try {
                await params.abort?.({ uploadId });
            } catch {
                // Best-effort only.
            }
        }
    }
}

/**
 * PUTs encrypted chunk frames to presigned URLs with bounded concurrency and notifies the daemon
 * strictly in index order as each contiguous chunk lands. Returns null on success.
 */
async function uploadChunksViaObjectStore(params: Readonly<{
    relay: ObjectStoreRelayDescriptor;
    chunkCount: number;
    encryptChunk: (index: number) => Promise<Readonly<{
        encrypted: Readonly<{ payloadBase64: string; encryptedDataKeyEnvelopeBase64: string }>;
        plainBytes: number;
    }>>;
    put: ObjectStorePut;
    signal: AbortSignal | null;
    notify: (index: number) => Promise<void>;
    onChunkCommitted: (plainBytes: number) => void;
}>): Promise<Readonly<{ result: { success: false; error: string }; relayFailed: boolean }> | null> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    params.signal?.addEventListener?.('abort', onOuterAbort);

    const landed: Array<Promise<number>> = [];
    const settle: Array<{ resolve: (plainBytes: number) => void; reject: (error: unknown) => void }> = [];
    for (let index = 0; index < params.chunkCount; index += 1) {
        const promise = new Promise<number>((resolve, reject) => {
            settle[index] = { resolve, reject };
        });
        promise.catch(() => undefined);
        landed.push(promise);
    }

    let nextIndex = 0;
    let readQueue: Promise<unknown> = Promise.resolve();
    const worker = async () => {
        while (!controller.signal.aborted && nextIndex < params.chunkCount) {
            const index = nextIndex;
            nextIndex += 1;
            try {
                // Serialize reads + encryption so file readers never see concurrent access.
                const preparing = readQueue.then(() => params.encryptChunk(index));
                readQueue = preparing.catch(() => undefined);
                const prepared = await preparing;
                const frame = encodeObjectStoreChunkFrame(prepared.encrypted);
                let lastError: unknown = null;
                for (let attempt = 1; attempt <= OBJECT_STORE_PUT_ATTEMPTS; attempt += 1) {
                    if (controller.signal.aborted) throw new Error('Upload canceled');
                    try {
                        await params.put(params.relay.putUrls[index], frame, controller.signal);
                        lastError = null;
                        break;
                    } catch (error) {
                        lastError = error;
                        if (attempt < OBJECT_STORE_PUT_ATTEMPTS) await delay(400 * attempt);
                    }
                }
                if (lastError) {
                    throw new ObjectStoreRelayError(lastError instanceof Error ? lastError.message : 'Object store upload failed');
                }
                settle[index].resolve(prepared.plainBytes);
            } catch (error) {
                settle[index].reject(error);
                controller.abort();
                return;
            }
        }
    };
    const workers = Array.from({ length: Math.min(OBJECT_STORE_PUT_CONCURRENCY, params.chunkCount) }, () => worker());

    try {
        for (let index = 0; index < params.chunkCount; index += 1) {
            let plainBytes: number;
            try {
                plainBytes = await landed[index];
                await params.notify(index);
            } catch (error) {
                if (params.signal?.aborted) {
                    return { result: { success: false, error: 'Upload canceled' }, relayFailed: false };
                }
                const message = error instanceof Error ? error.message : 'Upload chunk failed';
                return { result: { success: false, error: message }, relayFailed: error instanceof ObjectStoreRelayError };
            }
            params.onChunkCommitted(plainBytes);
        }
        return null;
    } finally {
        controller.abort();
        params.signal?.removeEventListener?.('abort', onOuterAbort);
        await Promise.allSettled(workers);
    }
}

export type ChunkDownloadProgress = Readonly<{
    downloadedBytes: number;
    totalBytes: number;
}>;

export async function downloadInChunks<
    TInit extends { success: boolean; downloadId?: string; chunkSizeBytes?: number; sizeBytes?: number; error?: string },
    TChunk extends {
        success: boolean;
        contentBase64?: string;
        payloadBase64?: string;
        encryptedDataKeyEnvelopeBase64?: string;
        isLast?: boolean;
        error?: string;
    },
    TFinalize extends { success: boolean; error?: string },
>(params: Readonly<{
    init: () => Promise<TInit>;
    readChunk: (request: Readonly<{ downloadId: string; index: number }>) => Promise<TChunk>;
    finalize: (request: Readonly<{ downloadId: string }>) => Promise<TFinalize>;
    abort?: ((request: Readonly<{ downloadId: string }>) => Promise<unknown>) | null;
    recipientSecretKeySeed?: Uint8Array | null;
    writeBytes: (bytes: Uint8Array) => Promise<void>;
    onProgress?: ((progress: ChunkDownloadProgress) => void) | null;
    signal?: AbortSignal | null;
}>): Promise<{ ok: true; sizeBytes: number } | { ok: false; error: string }> {
    let downloadId: string | null = null;

    try {
        const init = await params.init();
        if (!init || typeof init !== 'object' || (init as any).success !== true) {
            const error = typeof (init as any)?.error === 'string' ? (init as any).error : 'Download init failed';
            return { ok: false, error };
        }

        const initDownloadId = (init as any)?.downloadId;
        const totalBytes = (init as any)?.sizeBytes;
        if (typeof initDownloadId !== 'string' || !initDownloadId.trim()) {
            return { ok: false, error: 'Download init returned no downloadId' };
        }
        if (typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes < 0) {
            return { ok: false, error: 'Download init returned invalid sizeBytes' };
        }

        downloadId = initDownloadId;
        const emitProgress = (downloadedBytes: number) => {
            if (!params.onProgress) return;
            try {
                params.onProgress({ downloadedBytes, totalBytes });
            } catch {
                // ignore
            }
        };

        let index = 0;
        let downloadedBytes = 0;
        while (true) {
            if (params.signal?.aborted) {
                return { ok: false, error: 'Download canceled' };
            }

            const chunk = await params.readChunk({ downloadId, index });
            if (!chunk || typeof chunk !== 'object' || (chunk as any).success !== true) {
                const error = typeof (chunk as any)?.error === 'string' ? (chunk as any).error : 'Download chunk failed';
                return { ok: false, error };
            }

            const payloadBase64 = typeof (chunk as any).payloadBase64 === 'string' ? (chunk as any).payloadBase64 : '';
            const encryptedDataKeyEnvelopeBase64 = typeof (chunk as any).encryptedDataKeyEnvelopeBase64 === 'string'
                ? (chunk as any).encryptedDataKeyEnvelopeBase64
                : '';
            const contentBase64 = typeof (chunk as any).contentBase64 === 'string' ? (chunk as any).contentBase64 : '';
            if (payloadBase64) {
                if (!params.recipientSecretKeySeed) {
                    return { ok: false, error: 'Download chunk decryption key is unavailable' };
                }
                let bytes: Uint8Array;
                try {
                    bytes = await decryptEncryptedTransferChunkEnvelope({
                        transferId: downloadId,
                        sequence: index,
                        payloadBase64,
                        encryptedDataKeyEnvelopeBase64,
                        recipientSecretKeySeed: params.recipientSecretKeySeed,
                    });
                } catch {
                    return { ok: false, error: 'Download chunk decryption failed' };
                }
                await params.writeBytes(bytes);
                downloadedBytes += bytes.byteLength;
                emitProgress(downloadedBytes);
            } else if (contentBase64) {
                let bytes: Uint8Array;
                try {
                    bytes = decodeBase64(contentBase64, 'base64');
                } catch {
                    return { ok: false, error: 'Download chunk decode failed' };
                }
                await params.writeBytes(bytes);
                downloadedBytes += bytes.byteLength;
                emitProgress(downloadedBytes);
            }

            const isLast = Boolean((chunk as any).isLast);
            if (!payloadBase64 && !contentBase64 && !isLast) {
                return { ok: false, error: 'Download chunk returned no content' };
            }
            if (isLast) {
                break;
            }
            index += 1;
        }

        if (downloadedBytes !== totalBytes) {
            return { ok: false, error: 'Downloaded size did not match expected size' };
        }

        const finalized = await params.finalize({ downloadId });
        if (!finalized || typeof finalized !== 'object' || (finalized as any).success !== true) {
            const error = typeof (finalized as any)?.error === 'string' ? (finalized as any).error : 'Download finalize failed';
            return { ok: false, error };
        }

        downloadId = null;
        return { ok: true, sizeBytes: totalBytes };
    } finally {
        if (downloadId) {
            try {
                await params.abort?.({ downloadId });
            } catch {
                // Best-effort only.
            }
        }
    }
}
