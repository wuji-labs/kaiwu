import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSignerServer, presignS3Url } from './server.mjs';

test('presignS3Url matches the AWS SigV4 reference example', () => {
  const url = presignS3Url({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    key: 'test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    expiresSeconds: 86400,
    now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
});

async function withServer(deps, fn) {
  const server = createSignerServer({
    store: { host: 'bucket.cos.ap-shanghai.myqcloud.com', region: 'ap-shanghai', accessKeyId: 'AK', secretAccessKey: 'SK' },
    ...deps,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, body, authorization = 'Bearer good') => fetch(`${base}/v1/transfer-relay/presign`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization },
  body: JSON.stringify(body),
});

test('signs keys under the caller account prefix', async () => {
  await withServer({ resolveAccountId: async (auth) => (auth === 'Bearer good' ? 'acct123' : null) }, async (base) => {
    const res = await post(base, { method: 'PUT', keys: ['3f2a9c1e-aaaa-bbbb/0', '3f2a9c1e-aaaa-bbbb/1'] });
    assert.equal(res.status, 200);
    const { urls } = await res.json();
    assert.equal(urls.length, 2);
    assert.ok(urls[0].startsWith('https://bucket.cos.ap-shanghai.myqcloud.com/transfers/acct123/3f2a9c1e-aaaa-bbbb/0?'));
    assert.ok(urls[0].includes('X-Amz-Expires=3600'));
  });
});

test('rejects bad tokens, traversal keys and unknown methods', async () => {
  await withServer({ resolveAccountId: async (auth) => (auth === 'Bearer good' ? 'acct123' : null) }, async (base) => {
    assert.equal((await post(base, { method: 'PUT', keys: ['3f2a9c1e-aaaa/0'] }, 'Bearer bad')).status, 401);
    assert.equal((await post(base, { method: 'PUT', keys: ['3f2a9c1e-aaaa/0'] }, '')).status, 401);
    assert.equal((await post(base, { method: 'PUT', keys: ['../other/0'] })).status, 400);
    assert.equal((await post(base, { method: 'PUT', keys: ['otheracct/3f2a9c1e-aaaa/0'] })).status, 400);
    assert.equal((await post(base, { method: 'POST', keys: ['3f2a9c1e-aaaa/0'] })).status, 400);
    assert.equal((await post(base, { method: 'GET', keys: [] })).status, 400);
  });
});

test('reports 503 when the store is not configured', async () => {
  await withServer({ store: {}, resolveAccountId: async () => 'acct123' }, async (base) => {
    assert.equal((await post(base, { method: 'PUT', keys: ['3f2a9c1e-aaaa/0'] })).status, 503);
  });
});
