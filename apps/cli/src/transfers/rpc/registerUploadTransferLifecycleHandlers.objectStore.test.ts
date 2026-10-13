import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RpcHandlerRegistrar } from '@/api/rpc/types';
import { createEncryptedTransferChunkEnvelope } from '@/machines/transfer/transferChunkEncryption';

import { TransferSessionStore } from '../core/transferSessionStore';
import {
  createTransferObjectStore,
  TRANSFER_OBJECT_STORE_RELAY_KIND,
  type TransferObjectStoreConfig,
} from '../objectStore/transferObjectStore';
import { registerUploadTransferLifecycleHandlers } from './registerUploadTransferLifecycleHandlers';

type Handler = (data: unknown) => Promise<any>;

function createFakeBucket() {
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const keyOf = (url: string) => new URL(url).pathname.slice(1);
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const key = keyOf(url);
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') {
      objects.delete(key);
      deleted.push(key);
      return new Response(null, { status: 204 });
    }
    const body = objects.get(key);
    if (!body) return new Response('missing', { status: 404 });
    return new Response(body, { status: 200, headers: { 'content-length': String(body.byteLength) } });
  }) as typeof fetch;
  return { objects, deleted, keyOf, fakeFetch };
}

function frameChunk(envelope: Readonly<{ payloadBase64: string; encryptedDataKeyEnvelopeBase64: string }>): Uint8Array {
  const dk = Buffer.from(envelope.encryptedDataKeyEnvelopeBase64, 'base64');
  const payload = Buffer.from(envelope.payloadBase64, 'base64');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(dk.length, 0);
  return new Uint8Array(Buffer.concat([header, dk, payload]));
}

const CONFIG: TransferObjectStoreConfig = {
  host: 'bucket.cos.ap-shanghai.myqcloud.com',
  region: 'ap-shanghai',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
  minBytes: 1,
  chunkBytes: 256 * 1024,
  urlTtlSeconds: 60,
};

async function setup(params: Readonly<{ expectedSizeBytes: number; objectStoreConfig?: TransferObjectStoreConfig | null }>) {
  const handlers = new Map<string, Handler>();
  const rpcHandlerManager: RpcHandlerRegistrar = {
    registerHandler(method, handler) {
      handlers.set(method, handler as Handler);
    },
  };
  const bucket = createFakeBucket();
  const tempDir = await mkdtemp(join(tmpdir(), 'happier-upload-object-store-test-'));
  const destPath = join(tempDir, 'dest.bin');
  const store = new TransferSessionStore({ ttlMs: 30_000 });
  const objectStoreConfig = params.objectStoreConfig === undefined ? CONFIG : params.objectStoreConfig;

  registerUploadTransferLifecycleHandlers<any, any>({
    rpcHandlerManager,
    store,
    methods: { init: 'init', chunk: 'chunk', finalize: 'finalize', abort: 'abort' },
    resolveInit: async () => ({
      kind: 'accepted',
      target: {
        destPath,
        destDisplayPath: 'dest.bin',
        overwrite: true,
        expectedSizeBytes: params.expectedSizeBytes,
        finalizeUpload: async ({ tempPath, sizeBytes }: { tempPath: string; sizeBytes: number }) => {
          const { rename } = await import('node:fs/promises');
          await rename(tempPath, destPath);
          return { success: true as const, path: destPath, sizeBytes };
        },
      } as any,
    }),
    buildInitSuccessResponse: ({ session }) => ({
      success: true,
      uploadId: session.uploadId,
      chunkSizeBytes: session.chunkSizeBytes,
      recipientPublicKeyBase64: session.recipientPublicKeyBase64 ?? '',
    }),
    buildFinalizeMissingUploadIdResponse: () => ({ success: false, error: 'missing uploadId' }),
    buildFinalizeMissingSessionResponse: () => ({ success: false, error: 'missing session' }),
    buildFinalizeSizeMismatchResponse: () => ({ success: false, error: 'size mismatch' }),
    buildFinalizeHashMismatchResponse: () => ({ success: false, error: 'hash mismatch' }),
    buildFinalizeErrorResponse: () => ({ success: false, error: 'finalize error' }),
    buildFinalizeFailureResponse: (error) => ({ success: false, error }),
    buildFinalizeSuccessResponse: ({ finalized, sha256 }) => ({ success: true, path: finalized.path, sha256 }),
    enableChunkEncryption: true,
    objectStore: objectStoreConfig ? createTransferObjectStore(objectStoreConfig, { fetch: bucket.fakeFetch }) : null,
  });

  return {
    handlers,
    bucket,
    destPath,
    cleanup: async () => {
      await store.dispose?.().catch?.(() => undefined);
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

describe('registerUploadTransferLifecycleHandlers (object store relay)', () => {
  it('relays encrypted chunks through presigned object-store URLs and cleans them up', async () => {
    const payload = Buffer.alloc(600 * 1024);
    for (let i = 0; i < payload.length; i += 1) payload[i] = (i * 31) % 251;
    const ctx = await setup({ expectedSizeBytes: payload.length });
    try {
      const init = await ctx.handlers.get('init')!({ objectStoreRelay: TRANSFER_OBJECT_STORE_RELAY_KIND });
      expect(init.success).toBe(true);
      expect(init.chunkSizeBytes).toBe(CONFIG.chunkBytes);
      expect(init.objectStore.kind).toBe(TRANSFER_OBJECT_STORE_RELAY_KIND);
      expect(init.objectStore.putUrls).toHaveLength(3);
      expect(init.objectStore.putUrls[0]).toContain('X-Amz-Signature=');

      // Client side: encrypt, frame and PUT each chunk, then notify the daemon in order.
      for (let index = 0; index < 3; index += 1) {
        const slice = payload.subarray(index * CONFIG.chunkBytes, (index + 1) * CONFIG.chunkBytes);
        const envelope = createEncryptedTransferChunkEnvelope({
          transferId: init.uploadId,
          sequence: index,
          payload: Buffer.from(slice),
          recipientPublicKeyBase64: init.recipientPublicKeyBase64,
        });
        ctx.bucket.objects.set(ctx.bucket.keyOf(init.objectStore.putUrls[index]), frameChunk(envelope));
        await expect(ctx.handlers.get('chunk')!({ uploadId: init.uploadId, index, objectStored: true })).resolves.toEqual({ success: true });
      }

      const finalized = await ctx.handlers.get('finalize')!({ uploadId: init.uploadId });
      expect(finalized).toEqual({
        success: true,
        path: ctx.destPath,
        sha256: createHash('sha256').update(payload).digest('hex'),
      });
      expect(Buffer.compare(await readFile(ctx.destPath), payload)).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ctx.bucket.objects.size).toBe(0);
    } finally {
      await ctx.cleanup();
    }
  });

  it('keeps the RPC path when the client does not request the relay', async () => {
    const ctx = await setup({ expectedSizeBytes: 600 * 1024 });
    try {
      const init = await ctx.handlers.get('init')!({});
      expect(init.success).toBe(true);
      expect(init.objectStore).toBeUndefined();
      expect(init.chunkSizeBytes).not.toBe(CONFIG.chunkBytes);
    } finally {
      await ctx.cleanup();
    }
  });

  it('keeps the RPC path when no object store is configured', async () => {
    const ctx = await setup({ expectedSizeBytes: 600 * 1024, objectStoreConfig: null });
    try {
      const init = await ctx.handlers.get('init')!({ objectStoreRelay: TRANSFER_OBJECT_STORE_RELAY_KIND });
      expect(init.objectStore).toBeUndefined();
    } finally {
      await ctx.cleanup();
    }
  });

  it('fails closed when a relayed chunk is missing or tampered', async () => {
    const ctx = await setup({ expectedSizeBytes: 1024 });
    try {
      const init = await ctx.handlers.get('init')!({ objectStoreRelay: TRANSFER_OBJECT_STORE_RELAY_KIND });
      const missing = await ctx.handlers.get('chunk')!({ uploadId: init.uploadId, index: 0, objectStored: true });
      expect(missing.success).toBe(false);

      const envelope = createEncryptedTransferChunkEnvelope({
        transferId: init.uploadId,
        sequence: 0,
        payload: Buffer.alloc(1024, 7),
        recipientPublicKeyBase64: init.recipientPublicKeyBase64,
      });
      const frame = frameChunk(envelope);
      frame[frame.length - 1] ^= 0xff;
      ctx.bucket.objects.set(ctx.bucket.keyOf(init.objectStore.putUrls[0]), frame);
      const tampered = await ctx.handlers.get('chunk')!({ uploadId: init.uploadId, index: 0, objectStored: true });
      expect(tampered.success).toBe(false);
    } finally {
      await ctx.cleanup();
    }
  });

  it('deletes unconsumed relay objects on abort', async () => {
    const ctx = await setup({ expectedSizeBytes: 600 * 1024 });
    try {
      const init = await ctx.handlers.get('init')!({ objectStoreRelay: TRANSFER_OBJECT_STORE_RELAY_KIND });
      await ctx.handlers.get('abort')!({ uploadId: init.uploadId });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ctx.bucket.deleted).toHaveLength(3);
    } finally {
      await ctx.cleanup();
    }
  });
});
