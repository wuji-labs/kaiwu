#!/usr/bin/env node
// Verify the live Kaiwu OTA endpoint the way an installed app sees it: request the manifest with the
// expo-updates headers, verify the RSA signature against the embedded certificate, check that the
// manifest carries extra.expoClient, and download the launch asset plus a sample of assets to check
// their hashes.
// Usage: node scripts/ota/verify-production.mjs [--platform ios|android|all] [--sample 5]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const platforms = arg('--platform', 'all') === 'all' ? ['ios', 'android'] : [arg('--platform', 'ios')];
const sample = Number(arg('--sample', '5'));
const manifestUrl = arg('--url', 'https://kaiwu.chengqiyun.com/ota/api/manifest');
const channel = arg('--channel', 'production');
const runtimeVersion = arg(
  '--runtime-version',
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/ui/package.json'), 'utf8')).happierExpoRuntimeVersion,
);
const certPem = fs.readFileSync(path.join(repoRoot, 'apps/ui/certs/kaiwu-ota-certificate.pem'), 'utf8');
const publicKey = new crypto.X509Certificate(certPem).publicKey;

const sha256b64url = (buf) => crypto.createHash('sha256').update(buf).digest('base64url');

function parseMultipart(body, contentType) {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!boundary) throw new Error(`no multipart boundary in ${contentType}`);
  const parts = {};
  for (const chunk of body.split(`--${boundary}`)) {
    const trimmed = chunk.replace(/^\r\n/, '');
    if (!trimmed || trimmed.startsWith('--')) continue;
    const sep = trimmed.indexOf('\r\n\r\n');
    const headerText = trimmed.slice(0, sep);
    const content = trimmed.slice(sep + 4).replace(/\r\n$/, '');
    const headers = Object.fromEntries(
      headerText.split('\r\n').map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()];
      }),
    );
    const name = /name="([^"]+)"/.exec(headers['content-disposition'] ?? '')?.[1];
    if (name) parts[name] = { headers, content };
  }
  return parts;
}

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

for (const platform of platforms) {
  console.log(`\n== ${platform} (runtime ${runtimeVersion}, channel ${channel})`);
  const res = await fetch(manifestUrl, {
    headers: {
      'expo-platform': platform,
      'expo-runtime-version': runtimeVersion,
      'expo-protocol-version': '1',
      'expo-channel-name': channel,
      'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
      accept: 'multipart/mixed',
    },
  });
  check(res.status === 200, `manifest HTTP ${res.status}`);
  if (res.status !== 200) continue;
  check(res.headers.get('expo-protocol-version') === '1', 'expo-protocol-version: 1');
  const parts = parseMultipart(await res.text(), res.headers.get('content-type') ?? '');
  const manifestPart = parts.manifest;
  check(!!manifestPart, 'manifest part present');
  if (!manifestPart) continue;
  const sigHeader = manifestPart.headers['expo-signature'] ?? '';
  const sig = /sig="([^"]+)"/.exec(sigHeader)?.[1];
  const verified =
    !!sig && crypto.verify('sha256', Buffer.from(manifestPart.content, 'utf8'), publicKey, Buffer.from(sig, 'base64'));
  check(verified, 'manifest signature verifies against apps/ui/certs/kaiwu-ota-certificate.pem');
  const manifest = JSON.parse(manifestPart.content);
  check(manifest.runtimeVersion === runtimeVersion, `runtimeVersion ${manifest.runtimeVersion}`);
  check(!!manifest.extra?.expoClient?.extra, 'extra.expoClient present (Constants.expoConfig after update)');
  console.log(`      update ${manifest.id} created ${manifest.createdAt}, ${manifest.assets.length} assets`);

  const toCheck = [manifest.launchAsset, ...manifest.assets.slice(0, sample)];
  for (const asset of toCheck) {
    const r = await fetch(asset.url);
    const buf = Buffer.from(await r.arrayBuffer());
    check(r.status === 200 && sha256b64url(buf) === asset.hash, `asset ${asset.url.split('asset=')[1]?.split('&')[0]} (${buf.length} B)`);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
