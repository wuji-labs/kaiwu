// Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
//
// Bug report relay: the self-hosted provider behind `capabilities.bugReports.providerUrl`.
// Reports stay on our own server; nothing is forwarded to the upstream reports service.
//
//   POST /v1/reports/session    { clientReportId, form, artifacts: [{ filename, contentType, sizeBytes, sourceKind }] }
//                               -> { reportId, uploadTargets: [{ artifactId, objectKey, uploadUrl, requiredHeaders }] }
//   PUT  /v1/reports/:id/artifacts/:artifactId?sig=...   (raw artifact body; sig is an HMAC issued by /session)
//   POST /v1/reports/submit     { reportId, uploadedArtifacts, issue: { number? } }
//                               -> { reportId, issueNumber, issueUrl }
//   GET  /v1/reports/:id        plain acknowledgement page (never shows report content)
//   GET  /v1/issues/similar?q=  public issues of the configured GitHub repo
//   GET  /healthz
//
// Report text and diagnostics are written to DATA_DIR and announced to the operators' WeCom group.
// A public GitHub issue (form text only, never artifacts) is created only when GITHUB_TOKEN is set;
// the issue repository is fixed server-side, so clients cannot post into arbitrary repositories.
// Zero dependencies: node:http + node:crypto + node:fs only.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const MAX_JSON_BYTES = 256 * 1024;
const MAX_ARTIFACTS = 24;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SIMILAR_CACHE_TTL_MS = 60_000;
const REPORT_ID_PATTERN = /^KW-\d{8}-[a-f0-9]{8}$/;
const ARTIFACT_ID_PATTERN = /^a\d{1,2}$/;

export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3030),
    dataDir: String(env.DATA_DIR ?? '/data'),
    publicBaseUrl: String(env.PUBLIC_BASE_URL ?? 'https://kaiwu.wujilabs.cn/bug-reports').replace(/\/+$/, ''),
    uploadSecret: String(env.UPLOAD_SECRET ?? ''),
    maxArtifactBytes: Math.max(1024, Number(env.MAX_ARTIFACT_BYTES ?? 10 * 1024 * 1024)),
    retentionDays: Math.max(1, Number(env.RETENTION_DAYS ?? 90)),
    sessionsPerHourPerIp: Math.max(1, Number(env.SESSIONS_PER_HOUR_PER_IP ?? 12)),
    wecomWebhookUrl: String(env.WECOM_WEBHOOK_URL ?? '').trim(),
    githubToken: String(env.GITHUB_TOKEN ?? '').trim(),
    issueOwner: String(env.ISSUE_OWNER ?? 'wuji-labs').trim(),
    issueRepo: String(env.ISSUE_REPO ?? 'kaiwu').trim(),
  };
}

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string';
  res.writeHead(status, {
    'content-type': isText ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isText ? body : JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function text(value, max) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function safeFilename(name) {
  const cleaned = String(name ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
  return cleaned || 'artifact.txt';
}

export function signUpload(secret, reportId, artifactId) {
  return createHmac('sha256', secret).update(`${reportId}/${artifactId}`).digest('hex');
}

function verifyUpload(secret, reportId, artifactId, sig) {
  const expected = Buffer.from(signUpload(secret, reportId, artifactId), 'hex');
  const given = Buffer.from(String(sig ?? ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Public issue body: what the reporter wrote, plus coarse environment. Never artifacts or server URLs. */
export function renderPublicIssueBody(form, reportId) {
  const lines = [];
  const add = (heading, value) => {
    const v = text(value, 4000);
    if (v) lines.push(`### ${heading}`, '', v, '');
  };
  add('概述', form.summary);
  add('当前表现', form.currentBehavior);
  add('期望表现', form.expectedBehavior);
  const steps = Array.isArray(form.reproductionSteps) ? form.reproductionSteps.map((s) => text(s, 500)).filter(Boolean) : [];
  if (steps.length) lines.push('### 复现步骤', '', ...steps.map((s, i) => `${i + 1}. ${s}`), '');
  add('近期变化', form.whatChangedRecently);
  const env = form.environment ?? {};
  const envBits = [
    env.appVersion && `版本 ${text(env.appVersion, 40)}`,
    env.platform && `平台 ${text(env.platform, 40)}`,
    env.osVersion && `系统 ${text(env.osVersion, 60)}`,
    form.frequency && `频率 ${text(form.frequency, 20)}`,
    form.severity && `严重度 ${text(form.severity, 20)}`,
  ].filter(Boolean);
  if (envBits.length) lines.push('### 环境', '', envBits.join(' · '), '');
  lines.push('---', `报告编号 \`${reportId}\`（诊断附件仅存于开物运维服务器，不公开）`);
  return lines.join('\n');
}

function renderOperatorNotice({ ticket, reportId, form, artifactCount, issueUrl }) {
  const env = form.environment ?? {};
  return [
    `## 开物问题报告 #${ticket}`,
    `**${text(form.title, 120) || '（无标题）'}**`,
    `> ${text(form.summary, 300) || '（无概述）'}`,
    `> 严重度：${text(form.severity, 20) || '未填'} · 频率：${text(form.frequency, 20) || '未填'}`,
    `> 版本：${text(env.appVersion, 40) || '?'} · 平台：${text(env.platform, 40) || '?'} · 部署：${text(env.deploymentType, 20) || '?'}`,
    `> 诊断附件：${artifactCount} 份（${form.consent?.includeDiagnostics ? '用户同意附带' : '用户未附带'}）`,
    `> 编号：${reportId}`,
    issueUrl ? `> 链接：${issueUrl}` : '',
  ].filter(Boolean).join('\n');
}

function ackPage(ticket) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>无极开物 · 问题报告已收到</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07070c;color:#e8e6f0;font-family:"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:420px;padding:40px;text-align:center}h1{font-size:22px;font-weight:600;margin:0 0 12px}p{color:#a8a3b8;line-height:1.7;margin:0}</style></head>
<body><main><h1>问题报告 #${ticket} 已收到</h1><p>感谢反馈。开物团队会尽快排查；诊断信息仅保存在开物运维服务器上，不会公开。</p></main></body></html>`;
}

export function createBugReportRelay(deps = {}) {
  const config = { ...readConfig(), ...(deps.config ?? {}) };
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  if (!config.uploadSecret) throw new Error('UPLOAD_SECRET is required');

  const reportsDir = join(config.dataDir, 'reports');
  const rateBuckets = new Map();
  const similarCache = new Map();
  let ticketChain = Promise.resolve();

  const reportDir = (id) => join(reportsDir, id);
  const readMeta = async (id) => JSON.parse(await readFile(join(reportDir(id), 'meta.json'), 'utf8'));
  const writeMeta = async (id, meta) => {
    const tmp = join(reportDir(id), `meta.json.${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8');
    await rename(tmp, join(reportDir(id), 'meta.json'));
  };

  function allowSession(ip) {
    const hour = Math.floor(now().getTime() / 3_600_000);
    const bucket = rateBuckets.get(ip);
    if (!bucket || bucket.hour !== hour) {
      rateBuckets.set(ip, { hour, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= config.sessionsPerHourPerIp;
  }

  function nextTicket() {
    const run = ticketChain.then(async () => {
      const path = join(config.dataDir, 'ticket-counter');
      const current = Number((await readFile(path, 'utf8').catch(() => '0')).trim()) || 0;
      await writeFile(path, String(current + 1), 'utf8');
      return current + 1;
    });
    ticketChain = run.catch(() => {});
    return run;
  }

  async function github(path, init = {}) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'kaiwu-bug-report-relay',
        ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return await response.json();
  }

  async function notify(markdown) {
    if (!config.wecomWebhookUrl) return;
    try {
      const response = await fetchImpl(config.wecomWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdown } }),
      });
      // WeCom answers HTTP 200 even on failure; the outcome is in errcode.
      const result = await response.json().catch(() => ({}));
      if (!response.ok || (result.errcode !== undefined && result.errcode !== 0)) {
        console.error(`[bug-report-relay] notify rejected: http ${response.status} errcode ${result.errcode} ${result.errmsg ?? ''}`);
      } else {
        console.log('[bug-report-relay] operators notified');
      }
    } catch (error) {
      console.error('[bug-report-relay] notify failed:', error?.message ?? error);
    }
  }

  async function createSession(req, res) {
    if (!allowSession(clientIp(req))) return send(res, 429, { error: 'Too many reports, try again later' });
    const body = await readJsonBody(req);
    const form = body?.form;
    if (!form || typeof form !== 'object' || !text(form.title, 200) || !form.consent?.acceptedPrivacyNotice) {
      return send(res, 400, { error: 'A title and accepted privacy notice are required' });
    }
    const declared = Array.isArray(body.artifacts) ? body.artifacts : [];
    if (declared.length > MAX_ARTIFACTS) return send(res, 400, { error: 'Too many artifacts' });
    for (const artifact of declared) {
      const size = Number(artifact?.sizeBytes);
      if (!Number.isFinite(size) || size < 0 || size > config.maxArtifactBytes) {
        return send(res, 413, { error: 'Artifact too large' });
      }
    }

    const stamp = now().toISOString().slice(0, 10).replace(/-/g, '');
    const reportId = `KW-${stamp}-${randomBytes(4).toString('hex')}`;
    const artifacts = declared.map((artifact, index) => ({
      artifactId: `a${index}`,
      filename: safeFilename(artifact.filename),
      contentType: text(artifact.contentType, 100) || 'text/plain',
      sourceKind: text(artifact.sourceKind, 40),
      sizeBytes: Math.floor(Number(artifact.sizeBytes)),
    }));
    await mkdir(join(reportDir(reportId), 'artifacts'), { recursive: true });
    await writeMeta(reportId, {
      reportId,
      status: 'session',
      createdAt: now().toISOString(),
      clientReportId: text(body.clientReportId, 120),
      form,
      artifacts,
    });

    return send(res, 200, {
      reportId,
      uploadTargets: artifacts.map((artifact, index) => ({
        artifactId: artifact.artifactId,
        objectKey: `${reportId}/${index}-${artifact.filename}`,
        uploadUrl: `${config.publicBaseUrl}/v1/reports/${reportId}/artifacts/${artifact.artifactId}?sig=${signUpload(config.uploadSecret, reportId, artifact.artifactId)}`,
        requiredHeaders: {},
      })),
    });
  }

  async function uploadArtifact(req, res, reportId, artifactId, sig) {
    if (!verifyUpload(config.uploadSecret, reportId, artifactId, sig)) return send(res, 403, { error: 'Invalid upload signature' });
    const meta = await readMeta(reportId).catch(() => null);
    const artifact = meta?.artifacts?.find((a) => a.artifactId === artifactId);
    if (!meta || meta.status !== 'session' || !artifact) return send(res, 404, { error: 'Unknown upload target' });
    if (now().getTime() - Date.parse(meta.createdAt) > SESSION_TTL_MS) return send(res, 410, { error: 'Upload session expired' });

    const limit = Math.min(config.maxArtifactBytes, artifact.sizeBytes + 1024);
    const target = join(reportDir(reportId), 'artifacts', `${artifactId}-${artifact.filename}`);
    // Write to a .part file and rename on success: a rejected upload must never look uploaded.
    const partial = `${target}.part`;
    let size = 0;
    const out = createWriteStream(partial);
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw Object.assign(new Error('Artifact larger than declared'), { status: 413 });
        if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      }
      await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
      await rename(partial, target);
    } catch (error) {
      await new Promise((resolve) => {
        out.once('close', resolve);
        out.destroy();
      });
      await rm(partial, { force: true });
      throw error;
    }
    return send(res, 200, { ok: true, sizeBytes: size });
  }

  async function submit(req, res) {
    const body = await readJsonBody(req);
    const reportId = String(body?.reportId ?? '');
    if (!REPORT_ID_PATTERN.test(reportId)) return send(res, 400, { error: 'Invalid reportId' });
    const meta = await readMeta(reportId).catch(() => null);
    if (!meta) return send(res, 404, { error: 'Unknown report' });
    if (meta.status === 'submitted') {
      return send(res, 200, { reportId, issueNumber: meta.issueNumber, issueUrl: meta.issueUrl });
    }

    const stored = new Set(await readdir(join(reportDir(reportId), 'artifacts')).catch(() => []));
    const missing = meta.artifacts.filter((a) => !stored.has(`${a.artifactId}-${a.filename}`));
    if (missing.length) return send(res, 400, { error: `Missing artifacts: ${missing.map((a) => a.artifactId).join(',')}` });

    const ticket = await nextTicket();
    let issueNumber = ticket;
    let issueUrl = `${config.publicBaseUrl}/v1/reports/${reportId}`;
    if (config.githubToken) {
      const repoPath = `/repos/${encodeURIComponent(config.issueOwner)}/${encodeURIComponent(config.issueRepo)}`;
      const existing = Number(body?.issue?.number);
      try {
        if (Number.isInteger(existing) && existing > 0) {
          await github(`${repoPath}/issues/${existing}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: renderPublicIssueBody(meta.form, reportId) }),
          });
          const issue = await github(`${repoPath}/issues/${existing}`);
          issueNumber = issue.number;
          issueUrl = issue.html_url;
        } else {
          const issue = await github(`${repoPath}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title: text(meta.form.title, 200), body: renderPublicIssueBody(meta.form, reportId), labels: ['bug-report'] }),
          });
          issueNumber = issue.number;
          issueUrl = issue.html_url;
        }
      } catch (error) {
        // The report is safely stored either way; a GitHub outage must not lose it.
        console.error('[bug-report-relay] GitHub sync failed:', error?.message ?? error);
      }
    }

    await writeMeta(reportId, { ...meta, status: 'submitted', submittedAt: now().toISOString(), ticket, issueNumber, issueUrl });
    await notify(renderOperatorNotice({ ticket, reportId, form: meta.form, artifactCount: meta.artifacts.length, issueUrl }));
    return send(res, 200, { reportId, issueNumber, issueUrl });
  }

  async function similarIssues(res, searchParams) {
    const query = text(searchParams.get('q'), 200).replace(/[^\p{L}\p{N}\s._-]+/gu, ' ').trim();
    if (query.length < 3) return send(res, 200, { issues: [] });
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 10, 25));
    const state = ['open', 'closed'].includes(searchParams.get('state')) ? searchParams.get('state') : null;
    const key = `${query}|${limit}|${state}`;
    const cached = similarCache.get(key);
    if (cached && now().getTime() - cached.at < SIMILAR_CACHE_TTL_MS) return send(res, 200, cached.value);

    let value = { issues: [] };
    try {
      const q = [`repo:${config.issueOwner}/${config.issueRepo}`, 'is:issue', state ? `state:${state}` : '', query].filter(Boolean).join(' ');
      const result = await github(`/search/issues?q=${encodeURIComponent(q)}&per_page=${limit}`);
      value = {
        issues: (result.items ?? []).map((item) => ({
          owner: config.issueOwner,
          repo: config.issueRepo,
          number: item.number,
          url: item.html_url,
          title: item.title,
          state: item.state === 'closed' ? 'closed' : 'open',
          updatedAt: item.updated_at,
        })),
      };
    } catch (error) {
      console.error('[bug-report-relay] similar issues failed:', error?.message ?? error);
    }
    similarCache.set(key, { at: now().getTime(), value });
    return send(res, 200, value);
  }

  async function sweepExpired() {
    const cutoff = now().getTime() - config.retentionDays * 86_400_000;
    for (const id of await readdir(reportsDir).catch(() => [])) {
      if (!REPORT_ID_PATTERN.test(id)) continue;
      const info = await stat(reportDir(id)).catch(() => null);
      if (info && info.mtimeMs < cutoff) await rm(reportDir(id), { recursive: true, force: true });
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://relay.local');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'POST' && path === '/v1/reports/session') return await createSession(req, res);
      if (req.method === 'POST' && path === '/v1/reports/submit') return await submit(req, res);
      if (req.method === 'GET' && path === '/v1/issues/similar') return await similarIssues(res, url.searchParams);

      const upload = /^\/v1\/reports\/([^/]+)\/artifacts\/([^/]+)$/.exec(path);
      if (req.method === 'PUT' && upload && REPORT_ID_PATTERN.test(upload[1]) && ARTIFACT_ID_PATTERN.test(upload[2])) {
        return await uploadArtifact(req, res, upload[1], upload[2], url.searchParams.get('sig'));
      }
      const ack = /^\/v1\/reports\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && ack && REPORT_ID_PATTERN.test(ack[1])) {
        const meta = await readMeta(ack[1]).catch(() => null);
        if (!meta || meta.status !== 'submitted') return send(res, 404, { error: 'Unknown report' });
        return send(res, 200, ackPage(meta.ticket));
      }
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[bug-report-relay] request failed:', error);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? 'Internal error' : error.message });
      else res.destroy();
    }
  });
  server.sweepExpired = sweepExpired;
  server.relayConfig = config;
  return server;
}

const isEntrypoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isEntrypoint) {
  const config = readConfig();
  const server = createBugReportRelay({ config });
  await mkdir(join(config.dataDir, 'reports'), { recursive: true });
  await server.sweepExpired();
  setInterval(() => server.sweepExpired().catch((error) => console.error('[bug-report-relay] sweep failed:', error)), 6 * 3_600_000).unref();
  server.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[bug-report-relay] listening on :${config.port} (wecom: ${Boolean(config.wecomWebhookUrl)}, github sync: ${Boolean(config.githubToken)}, repo: ${config.issueOwner}/${config.issueRepo})`,
    );
  });
}
