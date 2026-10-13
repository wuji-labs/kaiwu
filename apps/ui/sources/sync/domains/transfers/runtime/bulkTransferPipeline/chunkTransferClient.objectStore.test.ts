import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/runtime/isRuntimeActive', () => ({
    isRuntimeActive: () => true,
    subscribeToRuntimeActiveChange: () => () => undefined,
    waitForRuntimeActive: () => Promise.resolve(),
}));

import { encodeBase64 } from '@/encryption/base64';
import { OBJECT_STORE_RELAY_KIND, uploadInChunks } from './chunkTransferClient';
import { createTransferRecipientKeyPair, decryptEncryptedTransferChunkEnvelope } from './transferChunkEncryption';

function decodeFrame(frame: Uint8Array) {
    const envelopeLength = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false);
    return {
        encryptedDataKeyEnvelopeBase64: encodeBase64(frame.subarray(4, 4 + envelopeLength)),
        payloadBase64: encodeBase64(frame.subarray(4 + envelopeLength)),
    };
}

describe('chunkTransferClient object store relay', () => {
    const keyPair = createTransferRecipientKeyPair();
    const bytes = new Uint8Array(10).map((_, i) => i + 1);
    const relayInit = (options: { objectStoreRelay?: string }) => ({
        success: true as const,
        uploadId: 'u1',
        chunkSizeBytes: 4,
        recipientPublicKeyBase64: keyPair.recipientPublicKeyBase64,
        ...(options.objectStoreRelay === OBJECT_STORE_RELAY_KIND
            ? { objectStore: { kind: OBJECT_STORE_RELAY_KIND, putUrls: ['https://s/0', 'https://s/1', 'https://s/2'] } }
            : {}),
    });

    it('PUTs encrypted frames to presigned URLs and notifies the daemon in index order', async () => {
        const stored = new Map<string, Uint8Array>();
        const put = vi.fn(async (url: string, body: Uint8Array) => {
            // Land chunks out of order to prove notifications stay ordered.
            await new Promise((resolve) => setTimeout(resolve, url.endsWith('/0') ? 20 : 1));
            stored.set(url, body);
        });
        const initSpy = vi.fn(async (options: { objectStoreRelay?: string }) => relayInit(options));
        const chunkSpy = vi.fn(async (_req: { index: number; objectStored?: true; payloadBase64: string }) => ({ success: true as const }));
        const progressSpy = vi.fn();

        const res = await uploadInChunks({
            totalBytes: bytes.byteLength,
            readBytes: async (offset, length) => bytes.slice(offset, offset + length),
            init: initSpy,
            sendChunk: chunkSpy,
            finalize: async () => ({ success: true as const, path: 'f' }),
            abort: vi.fn(),
            onProgress: progressSpy,
            allowObjectStoreRelay: true,
            objectStorePut: put,
        });

        expect(res).toMatchObject({ success: true, path: 'f' });
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(initSpy.mock.calls[0]?.[0]).toEqual({ objectStoreRelay: OBJECT_STORE_RELAY_KIND });
        expect(put).toHaveBeenCalledTimes(3);
        expect(chunkSpy.mock.calls.map((call) => call[0])).toEqual([0, 1, 2].map((index) => ({
            uploadId: 'u1',
            index,
            payloadBase64: '',
            encryptedDataKeyEnvelopeBase64: '',
            objectStored: true,
        })));
        expect(progressSpy.mock.calls.map((call) => call[0].uploadedBytes)).toEqual([4, 8, 10]);

        const plain: number[] = [];
        for (let index = 0; index < 3; index += 1) {
            const frame = decodeFrame(stored.get(`https://s/${index}`)!);
            plain.push(...await decryptEncryptedTransferChunkEnvelope({
                transferId: 'u1',
                sequence: index,
                ...frame,
                recipientSecretKeySeed: keyPair.recipientSecretKeySeed,
            }));
        }
        expect(plain).toEqual(Array.from(bytes));
    });

    it('falls back to the RPC path when the object store is unreachable', async () => {
        const put = vi.fn(async () => {
            throw new Error('network down');
        });
        const initSpy = vi.fn(async (options: { objectStoreRelay?: string }) => relayInit(options));
        const chunkSpy = vi.fn(async (_req: { objectStored?: true; payloadBase64: string }) => ({ success: true as const }));
        const abortSpy = vi.fn(async () => ({ success: true as const }));

        const res = await uploadInChunks({
            totalBytes: bytes.byteLength,
            readBytes: async (offset, length) => bytes.slice(offset, offset + length),
            init: initSpy,
            sendChunk: chunkSpy,
            finalize: async () => ({ success: true as const, path: 'f' }),
            abort: abortSpy,
            allowObjectStoreRelay: true,
            objectStorePut: put,
        });

        expect(res).toMatchObject({ success: true, path: 'f' });
        expect(initSpy.mock.calls.map((call) => call[0])).toEqual([{ objectStoreRelay: OBJECT_STORE_RELAY_KIND }, {}]);
        expect(abortSpy).toHaveBeenCalledTimes(1);
        expect(chunkSpy).toHaveBeenCalledTimes(3);
        expect(chunkSpy.mock.calls.every((call) => call[0].objectStored === undefined && call[0].payloadBase64.length > 0)).toBe(true);
    }, 15_000);

    it('uses the RPC path when the daemon does not offer a relay', async () => {
        const put = vi.fn();
        const initSpy = vi.fn(async () => relayInit({}));
        const chunkSpy = vi.fn(async (_req: { payloadBase64: string }) => ({ success: true as const }));

        const res = await uploadInChunks({
            totalBytes: bytes.byteLength,
            readBytes: async (offset, length) => bytes.slice(offset, offset + length),
            init: initSpy,
            sendChunk: chunkSpy,
            finalize: async () => ({ success: true as const, path: 'f' }),
            allowObjectStoreRelay: true,
            objectStorePut: put,
        });

        expect(res).toMatchObject({ success: true });
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(put).not.toHaveBeenCalled();
        expect(chunkSpy).toHaveBeenCalledTimes(3);
    });
});
