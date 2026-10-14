// Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
//
// Transfer relay signer: issues short-lived presigned object-store URLs to authenticated daemons so
// member machines can use the attachment object-store relay without holding any storage credentials.
//
//   POST /v1/transfer-relay/presign
//   Authorization: Bearer <the daemon's account token>
//   { "method": "PUT" | "GET" | "DELETE", "keys": ["<uploadId>/<index>", ...] }
//   -> 200 { "urls": [...] }   (keys are scoped server-side to transfers/<accountId>/...)
//
// The bearer token is verified against the relay server (GET /v1/account/profile); the account id
// returned there namespaces every key, so one account can never sign another account's objects.
// Zero dependencies: node:http + node:crypto only.

import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3020);
const RELAY_SERVER_URL = String(process.env.RELAY_SERVER_URL ?? 'http://wuji-kaiwu-server:3005').replace(/\/+$/, '');
const STORE_HOST = String(process.env.TRANSFER_STORE_HOST ?? '').trim();
const STORE_REGION = String(process.env.TRANSFER_STORE_REGION ?? '').trim();
const ACCESS_KEY_ID = String(process.env.TRANSFER_STORE_ACCESS_KEY_ID ?? '').trim();
const SECRET_ACCESS_KEY = String(process.env.TRANSFER_STORE_SECRET_ACCESS_KEY ?? '').trim();
const URL_TTL_SECONDS = 3600;
const MAX_KEYS_PER_REQUEST = 512;
const MAX_BODY_BYTES = 64 * 1024;
const AUTH_CACHE_TTL_MS = 60_000;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,64}\/\d{1,6}$/;

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** AWS SigV4 query-string presign (UNSIGNED-PAYLOAD, signed headers: host). Mirrors apps/cli presignS3Url. */
export function presignS3Url({ method, host, key, region, accessKeyId, secretAccessKey, expiresSeconds, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${key.split('/').map(encodeRfc3986).join('/')}`;
  const canonicalQuery = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.floor(expiresSeconds)))],
    ['X-Amz-SignedHeaders', 'host'],
  ]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (k, v) => createHmac('sha256', k).update(v).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const authCache = new Map();

async function resolveAccountId(authorization) {
  const cached = authCache.get(authorization);
  if (cached && cached.expiresAt > Date.now()) return cached.accountId;
  const response = await fetch(`${RELAY_SERVER_URL}/v1/account/profile`, {
    headers: { authorization },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const profile = await response.json().catch(() => null);
  const accountId = typeof profile?.id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(profile.id) ? profile.id : null;
  if (accountId) {
    if (authCache.size > 1000) authCache.clear();
    authCache.set(authorization, { accountId, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  }
  return accountId;
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createSignerServer(deps = {}) {
  const resolveAccount = deps.resolveAccountId ?? resolveAccountId;
  const store = deps.store ?? {
    host: STORE_HOST,
    region: STORE_REGION,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  };

  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/transfer-relay/health') {
        return send(res, 200, { ok: true, configured: Boolean(store.host && store.accessKeyId) });
      }
      if (req.method !== 'POST' || req.url !== '/v1/transfer-relay/presign') {
        return send(res, 404, { error: 'not found' });
      }
      if (!store.host || !store.region || !store.accessKeyId || !store.secretAccessKey) {
        return send(res, 503, { error: 'transfer relay not configured' });
      }
      const authorization = String(req.headers.authorization ?? '');
      if (!/^Bearer \S+$/.test(authorization)) return send(res, 401, { error: 'unauthorized' });

      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return send(res, 400, { error: 'invalid body' });
      }
      const method = body?.method;
      const keys = body?.keys;
      if (!['PUT', 'GET', 'DELETE'].includes(method)) return send(res, 400, { error: 'invalid method' });
      if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS_PER_REQUEST
        || !keys.every((key) => typeof key === 'string' && KEY_PATTERN.test(key))) {
        return send(res, 400, { error: 'invalid keys' });
      }

      const accountId = await resolveAccount(authorization);
      if (!accountId) return send(res, 401, { error: 'unauthorized' });

      const now = new Date();
      const urls = keys.map((key) => presignS3Url({
        method,
        host: store.host,
        key: `transfers/${accountId}/${key}`,
        region: store.region,
        accessKeyId: store.accessKeyId,
        secretAccessKey: store.secretAccessKey,
        expiresSeconds: method === 'PUT' ? URL_TTL_SECONDS : 300,
        now,
      }));
      return send(res, 200, { urls });
    } catch {
      return send(res, 500, { error: 'internal error' });
    }
  });
}

const isEntrypoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isEntrypoint) {
  createSignerServer().listen(PORT, '0.0.0.0', () => {
    console.log(`[transfer-relay-signer] listening on :${PORT} (store configured: ${Boolean(STORE_HOST && ACCESS_KEY_ID)})`);
  });
}
