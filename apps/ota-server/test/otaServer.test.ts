import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createOtaServer } from '../dist/server.js';
import { verifyRsaSha256, parseSignatureHeader, sha256Base64Url } from '../dist/crypto.js';

describe('OTA Server Contract O1 Tests', () => {
  let tempDir: string;
  let dataDir: string;
  let privateKeyPath: string;
  let certPem: string;
  let server: http.Server;
  let serverUrl: string;
  let serverPort: number;

  const TEST_RUNTIME_VERSION = '0.2.7-native';
  const TEST_UPDATE_ID = 'e7a5b3c4-1234-5678-9abc-def012345678';

  before(async () => {
    // Generate temporary test keypair
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiwu-ota-test-'));
    dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const keysDir = path.join(tempDir, 'keys');
    fs.mkdirSync(keysDir, { recursive: true });
    privateKeyPath = path.join(keysDir, 'private-key.pem');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(privateKeyPath, privateKey);
    certPem = publicKey; // For verifyRsaSha256, Node crypto accepts SPKI public key PEM or X509 cert

    // Seed test update data
    const updateDir = path.join(dataDir, TEST_RUNTIME_VERSION, TEST_UPDATE_ID);
    fs.mkdirSync(path.join(updateDir, '_expo', 'static', 'js', 'ios'), { recursive: true });
    fs.mkdirSync(path.join(updateDir, 'assets'), { recursive: true });

    // Seed bundle file
    const bundleContent = 'console.log("hello test bundle");';
    const bundleRelPath = '_expo/static/js/ios/AppEntry-test.hbc';
    fs.writeFileSync(path.join(updateDir, bundleRelPath), bundleContent);

    // Seed asset file
    const assetContent = 'test png data';
    const assetRelPath = 'assets/icon.png';
    fs.writeFileSync(path.join(updateDir, assetRelPath), assetContent);

    // Seed metadata.json
    const metadata = {
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        ios: {
          bundle: bundleRelPath,
          assets: [
            {
              path: assetRelPath,
              ext: 'png',
            },
          ],
        },
      },
    };
    fs.writeFileSync(path.join(updateDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Seed pointer file for iOS production
    const pointer = {
      updateId: TEST_UPDATE_ID,
      createdAt: '2026-09-29T12:00:00.000Z',
      runtimeVersion: TEST_RUNTIME_VERSION,
      platform: 'ios',
      channel: 'production',
      message: 'Test release',
    };
    fs.writeFileSync(
      path.join(dataDir, TEST_RUNTIME_VERSION, 'current-ios-production.json'),
      JSON.stringify(pointer, null, 2)
    );

    // Start server on an ephemeral port
    server = createOtaServer({
      port: 0,
      dataDir,
      privateKeyPath,
      publicBaseUrl: 'http://localhost/ota',
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
          serverUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('1. returns 200 on /ota/healthz and /healthz', async () => {
    const res1 = await fetch(`${serverUrl}/ota/healthz`);
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();
    assert.deepStrictEqual(body1, { status: 'ok' });

    const res2 = await fetch(`${serverUrl}/healthz`);
    assert.strictEqual(res2.status, 200);
    const body2 = await res2.json();
    assert.deepStrictEqual(body2, { status: 'ok' });
  });

  it('2. validates required headers on manifest endpoint', async () => {
    // Missing expo-platform
    const res1 = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-runtime-version': TEST_RUNTIME_VERSION,
      },
    });
    assert.strictEqual(res1.status, 400);

    // Invalid expo-platform
    const res2 = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'windows',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
      },
    });
    assert.strictEqual(res2.status, 400);

    // Missing expo-runtime-version
    const res3 = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
      },
    });
    assert.strictEqual(res3.status, 400);
  });

  it('3. returns 204 when no matching update exists or version mismatch', async () => {
    // Android has no pointer file in test setup
    const resAndroid = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
      },
    });
    assert.strictEqual(resAndroid.status, 204);
    assert.strictEqual(resAndroid.headers.get('expo-protocol-version'), '1');
    assert.strictEqual(resAndroid.headers.get('expo-sfv-version'), '0');
    assert.strictEqual(resAndroid.headers.get('cache-control'), 'private, max-age=0');

    // Runtime version mismatch
    const resWrongVer = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '9.9.9-nonexistent',
        'expo-protocol-version': '1',
      },
    });
    assert.strictEqual(resWrongVer.status, 204);
  });

  it('4. returns multipart/mixed manifest with valid RSA-SHA256 signature', async () => {
    const res = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
        'expo-channel-name': 'production',
        'expo-expect-signature': 'sig, keyid="main"',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('expo-protocol-version'), '1');
    assert.strictEqual(res.headers.get('expo-sfv-version'), '0');
    assert.strictEqual(res.headers.get('cache-control'), 'private, max-age=0');

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.startsWith('multipart/mixed; boundary='));
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    assert.ok(boundaryMatch, 'Boundary must be present in Content-Type header');
    const boundary = boundaryMatch[1];

    const bodyText = await res.text();
    assert.ok(bodyText.includes(`--${boundary}`));
    assert.ok(bodyText.includes('Content-Disposition: inline; name="manifest"'));
    assert.ok(bodyText.includes('Content-Type: application/json; charset=utf-8'));
    assert.ok(bodyText.includes('expo-signature: sig="'));

    // Extract signature header
    const sigLineMatch = bodyText.match(/expo-signature:\s*([^\r\n]+)/);
    assert.ok(sigLineMatch, 'expo-signature header line must be present in part');
    const parsedSig = parseSignatureHeader(sigLineMatch[1]);
    assert.ok(parsedSig, 'Signature header must be parseable');
    assert.strictEqual(parsedSig.keyid, 'main');

    // Extract JSON body
    const jsonStart = bodyText.indexOf('{', bodyText.indexOf('Content-Type'));
    const jsonEnd = bodyText.lastIndexOf('}');
    assert.ok(jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart);
    const jsonBody = bodyText.slice(jsonStart, jsonEnd + 1);

    // Verify signature with cert
    const isSigValid = verifyRsaSha256(jsonBody, parsedSig.sig, certPem);
    assert.strictEqual(isSigValid, true, 'RSA-SHA256 signature must be valid against certificate');

    // Verify manifest contents
    const manifest = JSON.parse(jsonBody);
    assert.strictEqual(manifest.id, TEST_UPDATE_ID);
    assert.strictEqual(manifest.runtimeVersion, TEST_RUNTIME_VERSION);
    assert.ok(manifest.launchAsset);
    assert.strictEqual(manifest.launchAsset.contentType, 'application/javascript');
    assert.strictEqual(manifest.launchAsset.hash, sha256Base64Url('console.log("hello test bundle");'));
    assert.ok(manifest.launchAsset.url.includes('/assets?asset='));
    assert.strictEqual(manifest.assets.length, 1);
    assert.strictEqual(manifest.assets[0].contentType, 'image/png');
    assert.strictEqual(manifest.assets[0].hash, sha256Base64Url('test png data'));
  });

  it('5. returns rollback directive when rollback: true is set', async () => {
    // Write rollback pointer
    const rollbackPointer = {
      rollback: true,
      commitTime: '2026-09-29T14:30:00.000Z',
    };
    fs.writeFileSync(
      path.join(dataDir, TEST_RUNTIME_VERSION, 'current-ios-production.json'),
      JSON.stringify(rollbackPointer, null, 2)
    );

    const res = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
        'expo-channel-name': 'production',
        'expo-expect-signature': 'sig, keyid="main"',
      },
    });

    assert.strictEqual(res.status, 200);
    const bodyText = await res.text();
    assert.ok(bodyText.includes('Content-Disposition: inline; name="directive"'));
    assert.ok(bodyText.includes('rollBackToEmbedded'));

    // Extract signature and JSON
    const sigLineMatch = bodyText.match(/expo-signature:\s*([^\r\n]+)/);
    assert.ok(sigLineMatch);
    const parsedSig = parseSignatureHeader(sigLineMatch[1]);
    assert.ok(parsedSig);

    const jsonStart = bodyText.indexOf('{', bodyText.indexOf('Content-Type'));
    const jsonEnd = bodyText.lastIndexOf('}');
    const jsonBody = bodyText.slice(jsonStart, jsonEnd + 1);

    const isSigValid = verifyRsaSha256(jsonBody, parsedSig.sig, certPem);
    assert.strictEqual(isSigValid, true);

    const directive = JSON.parse(jsonBody);
    assert.strictEqual(directive.type, 'rollBackToEmbedded');
    assert.strictEqual(directive.parameters.commitTime, '2026-09-29T14:30:00.000Z');

    // Restore normal pointer for remaining tests
    const pointer = {
      updateId: TEST_UPDATE_ID,
      createdAt: '2026-09-29T12:00:00.000Z',
      runtimeVersion: TEST_RUNTIME_VERSION,
      platform: 'ios',
      channel: 'production',
    };
    fs.writeFileSync(
      path.join(dataDir, TEST_RUNTIME_VERSION, 'current-ios-production.json'),
      JSON.stringify(pointer, null, 2)
    );
  });

  it('6. serves assets correctly with Content-Type and cache control', async () => {
    const res = await fetch(
      `${serverUrl}/ota/assets?asset=${encodeURIComponent('assets/icon.png')}&runtimeVersion=${TEST_RUNTIME_VERSION}&platform=ios&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const text = await res.text();
    assert.strictEqual(text, 'test png data');
  });

  it('7. blocks path traversal attempts on asset endpoint', async () => {
    // 1. Literal ..
    const res1 = await fetch(
      `${serverUrl}/ota/assets?asset=../keys/private-key.pem&runtimeVersion=${TEST_RUNTIME_VERSION}&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res1.status, 400);

    // 2. URL-encoded %2e%2e
    const res2 = await fetch(
      `${serverUrl}/ota/assets?asset=%2e%2e%2fkeys%2fprivate-key.pem&runtimeVersion=${TEST_RUNTIME_VERSION}&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res2.status, 400);

    // 3. Leading slash
    const res3 = await fetch(
      `${serverUrl}/ota/assets?asset=/etc/passwd&runtimeVersion=${TEST_RUNTIME_VERSION}&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res3.status, 400);

    // 4. Null byte injection
    const res4 = await fetch(
      `${serverUrl}/ota/assets?asset=assets/icon.png%00.txt&runtimeVersion=${TEST_RUNTIME_VERSION}&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res4.status, 400);

    // 5. Non-existent file
    const res5 = await fetch(
      `${serverUrl}/ota/assets?asset=assets/nonexistent.png&runtimeVersion=${TEST_RUNTIME_VERSION}&updateId=${TEST_UPDATE_ID}`
    );
    assert.strictEqual(res5.status, 404);
  });

  it('8. strictly isolates platforms and channels', async () => {
    // Seed Android bundle and pointer
    const updateDir = path.join(dataDir, TEST_RUNTIME_VERSION, TEST_UPDATE_ID);
    fs.mkdirSync(path.join(updateDir, '_expo', 'static', 'js', 'android'), { recursive: true });
    const androidBundleRelPath = '_expo/static/js/android/AppEntry-android.hbc';
    fs.writeFileSync(path.join(updateDir, androidBundleRelPath), 'console.log("android bundle");');

    const metadata = JSON.parse(fs.readFileSync(path.join(updateDir, 'metadata.json'), 'utf8'));
    metadata.fileMetadata.android = {
      bundle: androidBundleRelPath,
      assets: [],
    };
    fs.writeFileSync(path.join(updateDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    const androidPointer = {
      updateId: TEST_UPDATE_ID,
      createdAt: '2026-09-29T12:00:00.000Z',
      runtimeVersion: TEST_RUNTIME_VERSION,
      platform: 'android',
      channel: 'production',
    };
    fs.writeFileSync(
      path.join(dataDir, TEST_RUNTIME_VERSION, 'current-android-production.json'),
      JSON.stringify(androidPointer, null, 2)
    );

    // Request iOS
    const resIos = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
      },
    });
    assert.strictEqual(resIos.status, 200);
    const bodyIos = await resIos.text();
    assert.ok(bodyIos.includes(sha256Base64Url('console.log("hello test bundle");')));
    assert.ok(!bodyIos.includes(sha256Base64Url('console.log("android bundle");')));

    // Request Android
    const resAndroid = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
      },
    });
    assert.strictEqual(resAndroid.status, 200);
    const bodyAndroid = await resAndroid.text();
    assert.ok(bodyAndroid.includes(sha256Base64Url('console.log("android bundle");')));
    assert.ok(!bodyAndroid.includes(sha256Base64Url('console.log("hello test bundle");')));

    // Request unknown channel
    const resStaging = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': TEST_RUNTIME_VERSION,
        'expo-protocol-version': '1',
        'expo-channel-name': 'staging',
      },
    });
    assert.strictEqual(resStaging.status, 204);
  });
});
