import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createRemoteSignedTransferObjectStore,
  decodeTransferObjectChunkFrame,
  loadTransferObjectStore,
  loadTransferObjectStoreConfig,
  resolveTransferObjectStoreConfig,
  TRANSFER_OBJECT_STORE_CONFIG_FILE_NAME,
} from './transferObjectStore';

const FULL_ENV = {
  HAPPIER_TRANSFER_OBJECT_STORE_HOST: 'https://bucket.cos.ap-shanghai.myqcloud.com/',
  HAPPIER_TRANSFER_OBJECT_STORE_REGION: 'ap-shanghai',
  HAPPIER_TRANSFER_OBJECT_STORE_ACCESS_KEY_ID: 'AK',
  HAPPIER_TRANSFER_OBJECT_STORE_SECRET_ACCESS_KEY: 'SK',
};

describe('transferObjectStore config', () => {
  it('is off unless host, region and credentials are all set', () => {
    expect(resolveTransferObjectStoreConfig({})).toBeNull();
    expect(resolveTransferObjectStoreConfig({ ...FULL_ENV, HAPPIER_TRANSFER_OBJECT_STORE_SECRET_ACCESS_KEY: '' })).toBeNull();
  });

  it('normalizes the host and applies bounded defaults', () => {
    const config = resolveTransferObjectStoreConfig({ ...FULL_ENV, HAPPIER_TRANSFER_OBJECT_STORE_CHUNK_BYTES: '999999999' });
    expect(config?.host).toBe('bucket.cos.ap-shanghai.myqcloud.com');
    expect(config?.minBytes).toBe(1024 * 1024);
    expect(config?.chunkBytes).toBe(1024 * 1024);
  });

  it('prefers env and falls back to the home-dir config file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'happier-object-store-config-'));
    try {
      expect(loadTransferObjectStoreConfig({}, home)).toBeNull();
      await writeFile(join(home, TRANSFER_OBJECT_STORE_CONFIG_FILE_NAME), JSON.stringify({ ...FULL_ENV, UNRELATED: 'x' }));
      expect(loadTransferObjectStoreConfig({}, home)?.accessKeyId).toBe('AK');
      expect(loadTransferObjectStoreConfig({ ...FULL_ENV, HAPPIER_TRANSFER_OBJECT_STORE_ACCESS_KEY_ID: 'ENV' }, home)?.accessKeyId).toBe('ENV');
      await writeFile(join(home, TRANSFER_OBJECT_STORE_CONFIG_FILE_NAME), 'not json');
      expect(loadTransferObjectStoreConfig({}, home)).toBeNull();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('decodeTransferObjectChunkFrame', () => {
  it('splits envelope and payload', () => {
    const frame = new Uint8Array([0, 0, 0, 2, 9, 8, 1, 2, 3]);
    const decoded = decodeTransferObjectChunkFrame(frame);
    expect(Array.from(decoded.encryptedDataKeyEnvelope)).toEqual([9, 8]);
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3]);
  });

  it('rejects truncated or empty-envelope frames', () => {
    expect(() => decodeTransferObjectChunkFrame(new Uint8Array([0, 0]))).toThrow();
    expect(() => decodeTransferObjectChunkFrame(new Uint8Array([0, 0, 0, 0, 1]))).toThrow();
    expect(() => decodeTransferObjectChunkFrame(new Uint8Array([0, 0, 0, 9, 1]))).toThrow();
  });
});

describe('remote signed transfer object store', () => {
  it('posts keys with the account token and returns signed urls', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ urls: body.keys.map((k: string) => `https://b/transfers/acct/${k}?sig`) }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = createRemoteSignedTransferObjectStore({
      signerUrl: 'https://relay/v1/transfer-relay/presign',
      getAuthorization: async () => 'Bearer t',
      limits: { minBytes: 1, chunkBytes: 1024 },
      fetch: fakeFetch,
    });
    await expect(store.presignPuts(['r1/0', 'r1/1'])).resolves.toEqual(['https://b/transfers/acct/r1/0?sig', 'https://b/transfers/acct/r1/1?sig']);
    expect(calls[0]?.url).toBe('https://relay/v1/transfer-relay/presign');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ method: 'PUT', keys: ['r1/0', 'r1/1'] });
  });

  it('fails when the signer is missing or unauthenticated', async () => {
    const store = createRemoteSignedTransferObjectStore({
      signerUrl: 'https://relay/v1/transfer-relay/presign',
      getAuthorization: async () => 'Bearer t',
      limits: { minBytes: 1, chunkBytes: 1024 },
      fetch: (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch,
    });
    await expect(store.presignPuts(['r1/0'])).rejects.toThrow('404');
    const anonymous = createRemoteSignedTransferObjectStore({
      signerUrl: 'https://relay/x',
      getAuthorization: async () => null,
      limits: { minBytes: 1, chunkBytes: 1024 },
    });
    await expect(anonymous.presignPuts(['r1/0'])).rejects.toThrow('no account credentials');
  });

  it('defaults to the relay server signer and honours the off switch', () => {
    const base = { happyHomeDir: '/nonexistent', serverUrl: 'https://kaiwu.example.com/', getAuthorization: async () => null };
    expect(loadTransferObjectStore({ ...base, env: {} })).not.toBeNull();
    expect(loadTransferObjectStore({ ...base, env: { HAPPIER_TRANSFER_OBJECT_STORE: 'off' } })).toBeNull();
    expect(loadTransferObjectStore({ ...base, serverUrl: 'http://insecure.example.com', env: {} })).toBeNull();
  });
});
