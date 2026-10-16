import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { searchBugReportSimilarIssues } from '../../packages/protocol/dist/bugReports/similarIssues.js';
import { submitBugReportToService } from '../../packages/protocol/dist/bugReports/submit.js';
import { createBugReportRelay, renderPublicIssueBody, signUpload } from './server.mjs';

const FORM = {
  title: 'Daemon exits on start',
  summary: 'kaiwu daemon start exits immediately',
  currentBehavior: 'exits with code 1',
  expectedBehavior: 'daemon keeps running',
  reproductionSteps: ['Run kaiwu daemon start'],
  severity: 'high',
  frequency: 'always',
  environment: { appVersion: '0.2.27', platform: 'windows', deploymentType: 'cloud', serverUrl: 'https://kaiwu.wujilabs.cn' },
  consent: { includeDiagnostics: true, acceptedPrivacyNotice: true },
};

async function withRelay(overrides, fn) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kaiwu-bug-relay-'));
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://api.github.com/search/issues')) {
      return new Response(JSON.stringify({ items: [{ number: 7, html_url: 'https://github.com/wuji-labs/kaiwu/issues/7', title: 'Daemon exits', state: 'open', updated_at: '2026-10-16T00:00:00Z' }] }));
    }
    if (String(url).startsWith('https://api.github.com/repos/wuji-labs/kaiwu/issues')) {
      return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/wuji-labs/kaiwu/issues/42' }));
    }
    return new Response('{}');
  };
  let base = '';
  const server = createBugReportRelay({
    fetch: fakeFetch,
    config: {
      dataDir,
      uploadSecret: 'test-secret',
      wecomWebhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
      githubToken: '',
      ...overrides,
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.relayConfig.publicBaseUrl = base;
  try {
    await fn({ base, dataDir, calls });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('the real client submits a report end to end and diagnostics stay on our server', async () => {
  await withRelay({}, async ({ base, dataDir, calls }) => {
    const result = await submitBugReportToService({
      providerUrl: base,
      timeoutMs: 10_000,
      form: FORM,
      artifacts: [{ filename: 'daemon.log', sourceKind: 'daemon', contentType: 'text/plain', content: 'line 1\nline 2' }],
      issueOwner: 'wuji-labs',
      issueRepo: 'kaiwu',
    });
    assert.equal(result.issueNumber, 1);
    assert.match(result.reportId, /^KW-\d{8}-[a-f0-9]{8}$/);
    assert.equal(result.issueUrl, `${base}/v1/reports/${result.reportId}`);

    const files = await readdir(join(dataDir, 'reports', result.reportId, 'artifacts'));
    assert.deepEqual(files, ['a0-daemon.log']);
    assert.equal(await readFile(join(dataDir, 'reports', result.reportId, 'artifacts', 'a0-daemon.log'), 'utf8'), 'line 1\nline 2');

    const notice = calls.find((c) => c.url.startsWith('https://qyapi.weixin.qq.com'));
    assert.ok(notice, 'operators are notified');
    assert.match(JSON.parse(notice.init.body).markdown.content, /开物问题报告 #1/);
    assert.ok(!calls.some((c) => /happier\.dev/.test(c.url)), 'nothing is sent upstream');
    assert.ok(!calls.some((c) => c.url.startsWith('https://api.github.com')), 'no GitHub call without a token');

    const ack = await fetch(result.issueUrl);
    assert.equal(ack.status, 200);
    const page = await ack.text();
    assert.match(page, /#1 已收到/);
    assert.ok(!page.includes('line 1'), 'acknowledgement page never shows report content');
  });
});

test('with a token, a public issue is created from form text only, in the fixed repository', async () => {
  await withRelay({ githubToken: 'ghp_test', issueOwner: 'wuji-labs', issueRepo: 'kaiwu' }, async ({ base, calls }) => {
    const result = await submitBugReportToService({
      providerUrl: base,
      timeoutMs: 10_000,
      form: FORM,
      artifacts: [{ filename: 'session.log', sourceKind: 'session-log', contentType: 'text/plain', content: 'PRIVATE-TRANSCRIPT' }],
      issueOwner: 'someone-else',
      issueRepo: 'elsewhere',
    });
    assert.equal(result.issueNumber, 42);
    assert.equal(result.issueUrl, 'https://github.com/wuji-labs/kaiwu/issues/42');
    const create = calls.find((c) => c.url === 'https://api.github.com/repos/wuji-labs/kaiwu/issues');
    assert.ok(create, 'issue goes to the server-configured repository, not the client-supplied one');
    const body = JSON.parse(create.init.body).body;
    assert.ok(!body.includes('PRIVATE-TRANSCRIPT'));
    assert.ok(!body.includes('kaiwu.wujilabs.cn'), 'server URLs are not published');
  });
});

test('upload signatures, sizes and unknown routes are enforced', async () => {
  await withRelay({ maxArtifactBytes: 2048 }, async ({ base }) => {
    const session = await fetch(`${base}/v1/reports/session`, {
      method: 'POST',
      body: JSON.stringify({ form: FORM, artifacts: [{ filename: 'a.txt', contentType: 'text/plain', sizeBytes: 4 }] }),
    }).then((r) => r.json());
    const { reportId, uploadTargets } = session;

    const forged = await fetch(`${base}/v1/reports/${reportId}/artifacts/a0?sig=${'0'.repeat(64)}`, { method: 'PUT', body: 'data' });
    assert.equal(forged.status, 403);

    const oversized = await fetch(uploadTargets[0].uploadUrl, { method: 'PUT', body: 'x'.repeat(4096) });
    assert.equal(oversized.status, 413);

    const tooBig = await fetch(`${base}/v1/reports/session`, {
      method: 'POST',
      body: JSON.stringify({ form: FORM, artifacts: [{ filename: 'b.txt', sizeBytes: 999_999 }] }),
    });
    assert.equal(tooBig.status, 413);

    const missing = await fetch(`${base}/v1/reports/submit`, { method: 'POST', body: JSON.stringify({ reportId }) });
    assert.equal(missing.status, 400);

    const noConsent = await fetch(`${base}/v1/reports/session`, {
      method: 'POST',
      body: JSON.stringify({ form: { ...FORM, consent: { includeDiagnostics: false, acceptedPrivacyNotice: false } } }),
    });
    assert.equal(noConsent.status, 400);

    assert.equal((await fetch(`${base}/v1/reports/${reportId}`)).status, 404, 'unsubmitted reports have no page');
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal(signUpload('k', 'r', 'a').length, 64);
  });
});

test('sessions are rate limited per client address', async () => {
  await withRelay({ sessionsPerHourPerIp: 2 }, async ({ base }) => {
    const open = () => fetch(`${base}/v1/reports/session`, { method: 'POST', body: JSON.stringify({ form: FORM }) });
    assert.equal((await open()).status, 200);
    assert.equal((await open()).status, 200);
    assert.equal((await open()).status, 429);
  });
});

test('similar issues come from the configured public repository through the real client', async () => {
  await withRelay({}, async ({ base, calls }) => {
    const result = await searchBugReportSimilarIssues({ providerUrl: base, owner: 'wuji-labs', repo: 'kaiwu', query: 'daemon exits' });
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].url, 'https://github.com/wuji-labs/kaiwu/issues/7');
    const search = calls.find((c) => c.url.startsWith('https://api.github.com/search/issues'));
    assert.match(decodeURIComponent(search.url), /repo:wuji-labs\/kaiwu/);
  });
});

test('public issue body never carries artifacts or server urls', () => {
  const body = renderPublicIssueBody(FORM, 'KW-20261016-deadbeef');
  assert.match(body, /### 概述/);
  assert.match(body, /1\. Run kaiwu daemon start/);
  assert.ok(!body.includes('https://'));
});
