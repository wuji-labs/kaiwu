import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createOtaServer } from '../../apps/ota-server/dist/server.js';
import { verifyRsaSha256, parseSignatureHeader, sha256Base64Url } from '../../apps/ota-server/dist/crypto.js';

async function runE2E() {
  console.log('=== KAIWU OTA E2E VERIFICATION ===');

  import('node:os');
  const tempFallback = path.join(path.resolve('tmp/e2e-ota-data'));
  const osTempFallback = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'kaiwu-ota-e2e-data');
  const dataDir = fs.existsSync(tempFallback) ? tempFallback : osTempFallback;
  const privateKeyPath = process.env.OTA_PRIVATE_KEY_PATH || 'D:/Projects/qianyuan-wuji/secrets/kaiwu-ota/private-key.pem';
  const certPath = path.resolve('apps/ui/certs/kaiwu-ota-certificate.pem');

  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory ${dataDir} does not exist`);
  }
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key ${privateKeyPath} does not exist`);
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`Certificate ${certPath} does not exist`);
  }

  const certPem = fs.readFileSync(certPath, 'utf8');

  // 1. Start server on ephemeral port
  let serverPort = 0;
  let serverUrl = '';

  const server = createOtaServer({
    port: 0,
    dataDir,
    privateKeyPath,
    publicBaseUrl: 'http://127.0.0.1:EPHEMERAL/ota', // will update after listen
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      serverPort = addr.port;
      serverUrl = `http://127.0.0.1:${serverPort}`;
      resolve();
    });
  });

  console.log(`[E2E] Server listening on ${serverUrl}`);

  // Re-create server instance or update context base URL
  server.close();
  const activeServer = createOtaServer({
    port: serverPort,
    dataDir,
    privateKeyPath,
    publicBaseUrl: `${serverUrl}/ota`,
  });

  await new Promise((resolve) => {
    activeServer.listen(serverPort, '127.0.0.1', resolve);
  });

  try {
    // 2. Health check
    const healthRes = await fetch(`${serverUrl}/ota/healthz`);
    console.log(`[E2E] Health check status: ${healthRes.status} -> ${JSON.stringify(await healthRes.json())}`);

    // 3. Request Manifest with expo-updates client headers
    console.log(`[E2E] Requesting manifest with expo client headers...`);
    const manifestRes = await fetch(`${serverUrl}/ota/api/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '0.2.7-native',
        'expo-protocol-version': '1',
        'expo-channel-name': 'production',
        'expo-expect-signature': 'sig, keyid="main"',
      },
    });

    console.log(`[E2E] Manifest response status: ${manifestRes.status}`);
    console.log(`[E2E] Protocol version: ${manifestRes.headers.get('expo-protocol-version')}`);
    console.log(`[E2E] SFV version: ${manifestRes.headers.get('expo-sfv-version')}`);
    console.log(`[E2E] Cache-Control: ${manifestRes.headers.get('cache-control')}`);
    console.log(`[E2E] Content-Type: ${manifestRes.headers.get('content-type')}`);

    const contentType = manifestRes.headers.get('content-type') || '';
    if (!contentType.includes('multipart/mixed')) {
      throw new Error(`Expected multipart/mixed content-type, got: ${contentType}`);
    }

    const bodyText = await manifestRes.text();

    // 4. Parse multipart/mixed body
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) throw new Error('Missing boundary in Content-Type');
    const boundary = boundaryMatch[1];

    const sigLineMatch = bodyText.match(/expo-signature:\s*([^\r\n]+)/);
    if (!sigLineMatch) throw new Error('Missing expo-signature header in multipart body');
    const parsedSig = parseSignatureHeader(sigLineMatch[1]);
    console.log(`[E2E] Parsed signature header: keyid="${parsedSig.keyid}", sig length=${parsedSig.sig.length}`);

    const jsonStart = bodyText.indexOf('{', bodyText.indexOf('Content-Type'));
    const jsonEnd = bodyText.lastIndexOf('}');
    const manifestJsonString = bodyText.slice(jsonStart, jsonEnd + 1);

    // 5. Verify RSA-SHA256 signature against cert
    const isSigValid = verifyRsaSha256(manifestJsonString, parsedSig.sig, certPem);
    console.log(`[E2E] Signature verification against apps/ui/certs/kaiwu-ota-certificate.pem: ${isSigValid ? 'VALID (PASS)' : 'INVALID (FAIL)'}`);
    if (!isSigValid) {
      throw new Error('Code signing signature verification failed!');
    }

    const manifest = JSON.parse(manifestJsonString);
    console.log('\n--- FIRST 30 LINES OF MANIFEST JSON ---');
    const manifestLines = JSON.stringify(manifest, null, 2).split('\n');
    console.log(manifestLines.slice(0, 30).join('\n'));
    console.log('--- END OF PREVIEW (total lines: ' + manifestLines.length + ') ---\n');

    // 6. Download launchAsset and verify hash
    console.log(`[E2E] Verifying launchAsset: ${manifest.launchAsset.path || 'bundle'}`);
    console.log(`[E2E] LaunchAsset URL: ${manifest.launchAsset.url}`);
    console.log(`[E2E] Expected hash: ${manifest.launchAsset.hash}`);

    const launchRes = await fetch(manifest.launchAsset.url);
    if (launchRes.status !== 200) {
      throw new Error(`Failed to fetch launchAsset: status ${launchRes.status}`);
    }
    const launchBuf = Buffer.from(await launchRes.arrayBuffer());
    const actualLaunchHash = sha256Base64Url(launchBuf);
    console.log(`[E2E] Downloaded launchAsset size: ${launchBuf.length} bytes`);
    console.log(`[E2E] Actual hash:   ${actualLaunchHash}`);
    if (actualLaunchHash !== manifest.launchAsset.hash) {
      throw new Error(`LaunchAsset hash mismatch! expected=${manifest.launchAsset.hash}, actual=${actualLaunchHash}`);
    }
    console.log(`[E2E] LaunchAsset hash verification: PASS`);

    // 7. Download all assets and verify hashes
    console.log(`\n[E2E] Downloading and verifying ${manifest.assets.length} assets...`);
    let verifiedCount = 0;
    for (let i = 0; i < manifest.assets.length; i++) {
      const asset = manifest.assets[i];
      const assetRes = await fetch(asset.url);
      if (assetRes.status !== 200) {
        throw new Error(`Asset ${i} (${asset.path}) failed with status ${assetRes.status}`);
      }
      const assetBuf = Buffer.from(await assetRes.arrayBuffer());
      const actualHash = sha256Base64Url(assetBuf);
      if (actualHash !== asset.hash) {
        throw new Error(`Asset ${i} (${asset.path}) hash mismatch!`);
      }
      verifiedCount++;
    }

    console.log(`[E2E] Successfully downloaded and verified ${verifiedCount}/${manifest.assets.length} assets (100% PASS)!`);
    console.log('\n=== ALL E2E VERIFICATIONS PASSED SUCCESSFULLY ===');
  } finally {
    await new Promise((resolve) => activeServer.close(resolve));
    console.log('[E2E] Server stopped.');
  }
}

runE2E().catch((err) => {
  console.error('[E2E] Fatal error:', err);
  process.exit(1);
});
