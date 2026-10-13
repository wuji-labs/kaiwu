import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  decodeTransferObjectChunkFrame,
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
