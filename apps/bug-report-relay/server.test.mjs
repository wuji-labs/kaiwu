import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { searchBugReportSimilarIssues } from '../../packages/protocol/dist/bugReports/similarIssues.js';
import { submitBugReportToService } from '../../packages/protocol/dist/bugReports/submit.js';
import { createBugReportRelay, reportFormPage, signUpload } from './server.mjs';

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
    return new Response('{}');
  };
  let base = '';
  const server = createBugReportRelay({
    fetch: fakeFetch,
    config: {
      dataDir,
      uploadSecret: 'test-secret',
      wecomWebhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
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

    const ack = await fetch(result.issueUrl);
    assert.equal(ack.status, 200);
    const page = await ack.text();
    assert.match(page, /#1 已收到/);
    assert.ok(!page.includes('line 1'), 'acknowledgement page never shows report content');
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

async function submitReal(base, form, existingIssueNumber) {
  return await submitBugReportToService({
    providerUrl: base,
    timeoutMs: 10_000,
    form,
    artifacts: [],
    issueOwner: 'wuji-labs',
    issueRepo: 'kaiwu',
    existingIssueNumber,
  });
}

test('similar issues and follow-ups are served from our own reports, never a third party', async () => {
  await withRelay({}, async ({ base, calls }) => {
    const first = await submitReal(base, FORM);
    await submitReal(base, { ...FORM, title: 'Voice input crashes on Android' });

    const similar = await searchBugReportSimilarIssues({ providerUrl: base, owner: 'wuji-labs', repo: 'kaiwu', query: 'daemon exits immediately' });
    assert.deepEqual(similar.issues.map((i) => i.number), [first.issueNumber]);
    assert.equal(similar.issues[0].url, first.issueUrl);

    const followUp = await submitReal(base, { ...FORM, title: 'Same here' }, first.issueNumber);
    assert.equal(followUp.issueNumber, first.issueNumber, 'a follow-up attaches to the chosen ticket');
    assert.equal(followUp.issueUrl, first.issueUrl);

    const notices = calls.filter((c) => c.url.startsWith('https://qyapi.weixin.qq.com'));
    assert.match(JSON.parse(notices.at(-1).init.body).markdown.content, /追加反馈/);
    assert.ok(calls.every((c) => c.url.startsWith('https://qyapi.weixin.qq.com')), 'only our own notification channel is contacted');
  });
});

test('the hosted form accepts a report without the client API and escapes prefilled input', async () => {
  await withRelay({}, async ({ base, dataDir }) => {
    const html = reportFormPage(new URLSearchParams({ title: '<script>x</script>', body: 'line' }));
    assert.ok(!html.includes('<script>x</script>'));
    assert.match(html, /&lt;script&gt;/);

    const form = await fetch(`${base}/new?title=Broken%20login`);
    assert.equal(form.status, 200);
    assert.match(await form.text(), /value="Broken login"/);

    const noConsent = await fetch(`${base}/v1/reports/quick`, { method: 'POST', body: new URLSearchParams({ title: 'x' }) });
    assert.equal(noConsent.status, 400);

    const ok = await fetch(`${base}/v1/reports/quick`, { method: 'POST', body: new URLSearchParams({ title: 'Broken login', body: 'steps', consent: 'on' }) });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /#1 已收到/);
    const ids = await readdir(join(dataDir, 'reports'));
    const meta = JSON.parse(await readFile(join(dataDir, 'reports', ids[0], 'meta.json'), 'utf8'));
    assert.equal(meta.form.title, 'Broken login');
    assert.equal(meta.status, 'submitted');
  });
});
