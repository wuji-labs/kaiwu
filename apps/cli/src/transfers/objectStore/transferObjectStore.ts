import { readFileSync } from 'fs';
import { join } from 'path';

import { TRANSFER_CHUNK_HARD_MAX_BYTES } from '@/machines/transfer/transferChunkSizeLimit';

import { presignS3Url } from './presignS3Url';

/**
 * Object-store relay for large bulk uploads.
 *
 * The daemon hands the client one presigned PUT URL per chunk. The client PUTs already-encrypted
 * chunk frames straight to the store, then notifies the daemon per chunk over the regular (small)
 * RPC; the daemon fetches, decrypts and writes the chunk. This keeps bulk bytes off the relay
 * server's egress link. The store only ever sees ciphertext.
 *
 * URLs are signed either locally (this machine holds store credentials) or, by default, by the
 * relay server's signer endpoint using the daemon's account token, so member machines need no
 * storage credentials at all.
 */
export const TRANSFER_OBJECT_STORE_RELAY_KIND = 'presigned_put_v1';

export type TransferObjectStoreLimits = Readonly<{
  minBytes: number;
  chunkBytes: number;
}>;

export type TransferObjectStoreConfig = TransferObjectStoreLimits & Readonly<{
  host: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlTtlSeconds: number;
}>;

export type TransferObjectStore = Readonly<{
  config: TransferObjectStoreLimits;
  /** Keys are `<relayId>/<index>`; the store decides the physical prefix. */
  presignPuts: (keys: ReadonlyArray<string>) => Promise<string[]>;
  fetchObject: (key: string, opts: Readonly<{ maxBytes: number; timeoutMs: number }>) => Promise<Uint8Array>;
  deleteObject: (key: string) => Promise<void>;
}>;

const MIN_CHUNK_BYTES = 64 * 1024;
// Encrypted chunk decryption enforces this ceiling (OOM guard), so the relay can never exceed it.
const MAX_CHUNK_BYTES = TRANSFER_CHUNK_HARD_MAX_BYTES;
const SIGNER_PATH = '/v1/transfer-relay/presign';
const SIGNER_TIMEOUT_MS = 10_000;

function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = Number(String(env[name] ?? '').trim());
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function resolveLimits(env: NodeJS.ProcessEnv): TransferObjectStoreLimits {
  return {
    minBytes: readInt(env, 'HAPPIER_TRANSFER_OBJECT_STORE_MIN_BYTES', 1024 * 1024, 0, Number.MAX_SAFE_INTEGER),
    chunkBytes: readInt(env, 'HAPPIER_TRANSFER_OBJECT_STORE_CHUNK_BYTES', MAX_CHUNK_BYTES, MIN_CHUNK_BYTES, MAX_CHUNK_BYTES),
  };
}

/**
 * Local signing config. Returns null unless bucket host, region and credentials are all configured.
 *
 * HAPPIER_TRANSFER_OBJECT_STORE_HOST              e.g. kaiwu-transfer-1444025891.cos.ap-shanghai.myqcloud.com
 * HAPPIER_TRANSFER_OBJECT_STORE_REGION            e.g. ap-shanghai
 * HAPPIER_TRANSFER_OBJECT_STORE_ACCESS_KEY_ID
 * HAPPIER_TRANSFER_OBJECT_STORE_SECRET_ACCESS_KEY
 * HAPPIER_TRANSFER_OBJECT_STORE_MIN_BYTES         uploads smaller than this keep the RPC path (default 1MB)
 * HAPPIER_TRANSFER_OBJECT_STORE_CHUNK_BYTES       chunk size on the relay path (default and max 1MiB)
 */
export function resolveTransferObjectStoreConfig(env: NodeJS.ProcessEnv): TransferObjectStoreConfig | null {
  const host = String(env.HAPPIER_TRANSFER_OBJECT_STORE_HOST ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const region = String(env.HAPPIER_TRANSFER_OBJECT_STORE_REGION ?? '').trim();
  const accessKeyId = String(env.HAPPIER_TRANSFER_OBJECT_STORE_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = String(env.HAPPIER_TRANSFER_OBJECT_STORE_SECRET_ACCESS_KEY ?? '').trim();
  if (!host || !region || !accessKeyId || !secretAccessKey) return null;

  return {
    host,
    region,
    accessKeyId,
    secretAccessKey,
    ...resolveLimits(env),
    urlTtlSeconds: 3600,
  };
}

export const TRANSFER_OBJECT_STORE_CONFIG_FILE_NAME = 'transfer-object-store.json';

/**
 * Environment variables win; otherwise falls back to <happyHomeDir>/transfer-object-store.json, a JSON
 * object using the same HAPPIER_TRANSFER_OBJECT_STORE_* keys.
 */
export function loadTransferObjectStoreConfig(env: NodeJS.ProcessEnv, happyHomeDir: string): TransferObjectStoreConfig | null {
  const fromEnv = resolveTransferObjectStoreConfig(env);
  if (fromEnv) return fromEnv;
  try {
    const raw = JSON.parse(readFileSync(join(happyHomeDir, TRANSFER_OBJECT_STORE_CONFIG_FILE_NAME), 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const fileEnv: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key.startsWith('HAPPIER_TRANSFER_OBJECT_STORE_') && (typeof value === 'string' || typeof value === 'number')) {
        fileEnv[key] = String(value);
      }
    }
    return resolveTransferObjectStoreConfig(fileEnv);
  } catch {
    return null;
  }
}

async function fetchSignedObject(
  doFetch: typeof fetch,
  url: string,
  opts: Readonly<{ maxBytes: number; timeoutMs: number }>,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await doFetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Object store fetch failed (${response.status})`);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > opts.maxBytes) {
      throw new Error('Object store chunk exceeds configured chunk size');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > opts.maxBytes) {
      throw new Error('Object store chunk exceeds configured chunk size');
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

/** Signs URLs locally with store credentials held by this machine. Objects live under `transfers/`. */
export function createTransferObjectStore(
  config: TransferObjectStoreConfig,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): TransferObjectStore {
  const doFetch = deps.fetch ?? fetch;
  const sign = (method: 'GET' | 'PUT' | 'DELETE', key: string, expiresSeconds: number) => presignS3Url({
    method,
    host: config.host,
    key: `transfers/${key}`,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds,
  });

  return {
    config: { minBytes: config.minBytes, chunkBytes: config.chunkBytes },
    presignPuts: async (keys) => keys.map((key) => sign('PUT', key, config.urlTtlSeconds)),
    fetchObject: async (key, opts) => await fetchSignedObject(doFetch, sign('GET', key, 300), opts),
    deleteObject: async (key) => {
      await doFetch(sign('DELETE', key, 300), { method: 'DELETE' });
    },
  };
}

/**
 * Asks the relay server's signer endpoint for presigned URLs, authenticated with the daemon's account
 * token. The signer scopes keys to the caller's account, so no storage credentials live on this machine.
 */
export function createRemoteSignedTransferObjectStore(params: Readonly<{
  signerUrl: string;
  getAuthorization: () => Promise<string | null>;
  limits: TransferObjectStoreLimits;
  fetch?: typeof fetch;
}>): TransferObjectStore {
  const doFetch = params.fetch ?? fetch;
  const presign = async (method: 'GET' | 'PUT' | 'DELETE', keys: ReadonlyArray<string>): Promise<string[]> => {
    const authorization = await params.getAuthorization();
    if (!authorization) throw new Error('Transfer relay signer: no account credentials');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIGNER_TIMEOUT_MS);
    try {
      const response = await doFetch(params.signerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization },
        body: JSON.stringify({ method, keys }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Transfer relay signer failed (${response.status})`);
      const body = await response.json() as { urls?: unknown };
      const urls = body?.urls;
      if (!Array.isArray(urls) || urls.length !== keys.length || !urls.every((url) => typeof url === 'string' && url.startsWith('https://'))) {
        throw new Error('Transfer relay signer returned an invalid response');
      }
      return urls as string[];
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    config: params.limits,
    presignPuts: async (keys) => await presign('PUT', keys),
    fetchObject: async (key, opts) => {
      const [url] = await presign('GET', [key]);
      return await fetchSignedObject(doFetch, url!, opts);
    },
    deleteObject: async (key) => {
      const [url] = await presign('DELETE', [key]);
      await doFetch(url!, { method: 'DELETE' });
    },
  };
}

/**
 * Resolves the relay for this daemon: local credentials if configured, otherwise the relay server's
 * signer (on by default; set HAPPIER_TRANSFER_OBJECT_STORE=off to disable). If the server has no
 * signer, presigning fails at upload init and the upload simply keeps the RPC path.
 */
export function loadTransferObjectStore(params: Readonly<{
  env: NodeJS.ProcessEnv;
  happyHomeDir: string;
  serverUrl: string;
  getAuthorization: () => Promise<string | null>;
}>): TransferObjectStore | null {
  if (String(params.env.HAPPIER_TRANSFER_OBJECT_STORE ?? '').trim().toLowerCase() === 'off') return null;
  const local = loadTransferObjectStoreConfig(params.env, params.happyHomeDir);
  if (local) return createTransferObjectStore(local);

  const signerUrl = String(params.env.HAPPIER_TRANSFER_RELAY_SIGNER_URL ?? '').trim()
    || (params.serverUrl ? `${params.serverUrl.replace(/\/+$/, '')}${SIGNER_PATH}` : '');
  if (!signerUrl.startsWith('https://') && !signerUrl.startsWith('http://localhost') && !signerUrl.startsWith('http://127.0.0.1')) {
    return null;
  }
  return createRemoteSignedTransferObjectStore({
    signerUrl,
    getAuthorization: params.getAuthorization,
    limits: resolveLimits(params.env),
  });
}

export function buildTransferObjectKey(relayId: string, index: number): string {
  return `${relayId}/${index}`;
}

/**
 * Chunk frame stored in the object store:
 *   [u32 BE: encrypted data key envelope length][envelope bytes][encrypted payload bytes]
 */
export function decodeTransferObjectChunkFrame(frame: Uint8Array): Readonly<{
  encryptedDataKeyEnvelope: Uint8Array;
  payload: Uint8Array;
}> {
  if (frame.byteLength < 4) {
    throw new Error('Invalid object store chunk frame');
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const envelopeLength = view.getUint32(0, false);
  if (envelopeLength <= 0 || 4 + envelopeLength > frame.byteLength) {
    throw new Error('Invalid object store chunk frame');
  }
  return {
    encryptedDataKeyEnvelope: frame.subarray(4, 4 + envelopeLength),
    payload: frame.subarray(4 + envelopeLength),
  };
}
