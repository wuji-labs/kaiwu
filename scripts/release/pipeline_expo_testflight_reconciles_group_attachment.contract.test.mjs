import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

// The distribution script resolves apps/ui/eas.json from its working directory. These tests
// exercise ASC request mechanics against a mocked fetch, so they pin their own submit profile
// instead of coupling to the product's real App Store Connect app (which may legitimately be
// unprovisioned and fail closed for non-production lanes).
const fixtureAscAppId = '6761304097';

function writeFixtureSubmitProfile(fixtureRoot) {
  const uiDir = path.join(fixtureRoot, 'apps', 'ui');
  fs.mkdirSync(uiDir, { recursive: true });
  fs.writeFileSync(
    path.join(uiDir, 'eas.json'),
    JSON.stringify({
      submit: {
        publicdev: {
          ios: {
            ascAppId: fixtureAscAppId,
            ascApiKeyId: 'FIXTUREKEY',
            ascApiKeyIssuerId: '00000000-0000-4000-8000-000000000000',
          },
        },
      },
    }, null, 2),
  );
}
const groupId = '78315e16-c539-43ae-a65e-4f465dccaf68';

test('TestFlight distribution revalidates state before retrying a contradictory group attachment 404', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'happier-testflight-attachment-retry-'));
  writeFixtureSubmitProfile(fixtureRoot);
  const preloadPath = path.join(fixtureRoot, 'mock-asc.mjs');
  const requestsPath = path.join(fixtureRoot, 'requests.jsonl');
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

  fs.writeFileSync(
    preloadPath,
    `import fs from 'node:fs';

globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  const method = String(init.method ?? 'GET');
  fs.appendFileSync(process.env.HAPPIER_TEST_ASC_REQUESTS_PATH, JSON.stringify({ method, pathname }) + '\\n');

  if (pathname === '/v1/apps/6761304097/betaGroups') {
    return Response.json({
      data: [{
        type: 'betaGroups',
        id: '${groupId}',
        attributes: { name: 'Happier (dev)', isInternalGroup: false },
      }],
    });
  }
  if (pathname === '/v1/builds' && method === 'GET') {
    return Response.json({
      data: [{
        type: 'builds',
        id: 'build-1',
        attributes: { version: '295', uploadedDate: '2026-09-03T17:04:00Z', processingState: 'VALID' },
        relationships: {
          preReleaseVersion: { data: { type: 'preReleaseVersions', id: 'version-1' } },
          betaGroups: { data: [] },
        },
      }],
      included: [{ type: 'preReleaseVersions', id: 'version-1', attributes: { version: '0.2.11' } }],
    });
  }
  if (pathname === '/v1/builds/build-1' && method === 'GET') {
    return Response.json({ data: { type: 'builds', id: 'build-1', relationships: { betaGroups: { data: [] } } } });
  }
  if (pathname === '/v1/betaGroups/${groupId}/relationships/builds' && method === 'POST') {
    return Response.json({
      errors: [{ status: '404', code: 'NOT_FOUND', title: 'The specified resource does not exist' }],
    }, { status: 404 });
  }
  if (pathname === '/v1/builds/build-1/relationships/betaGroups' && method === 'POST') {
    return Response.json({});
  }
  return Response.json({ errors: [{ code: 'UNEXPECTED_TEST_URL', detail: method + ' ' + pathname }] }, { status: 500 });
};
`,
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(preloadPath).href,
        path.join(repoRoot, 'scripts', 'pipeline', 'expo', 'testflight-distribute.mjs'),
        '--environment=dev',
        `--external-groups=${groupId}`,
        '--build-number=295',
        '--app-version=0.2.11',
        '--wait-processing=false',
        '--submit-beta-review=false',
      ],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          APPLE_API_PRIVATE_KEY: privateKeyPem,
          HAPPIER_TEST_ASC_REQUESTS_PATH: requestsPath,
          HAPPIER_TESTFLIGHT_ATTACHMENT_RETRY_DELAY_MS: '0',
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const requests = fs.readFileSync(requestsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/relationships/builds')).length, 1);
    assert.equal(requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/relationships/betaGroups')).length, 1);
    assert.ok(requests.some(({ method, pathname }) => method === 'GET' && pathname === '/v1/builds/build-1'));
    assert.ok(requests.filter(({ method, pathname }) => method === 'GET' && pathname === '/v1/apps/6761304097/betaGroups').length >= 2);
    assert.match(result.stdout, /retrying TestFlight group attachment through build relationship after state reconciliation/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
