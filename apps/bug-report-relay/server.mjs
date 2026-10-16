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
//   GET  /v1/issues/similar?q=  titles of earlier reports received here (duplicate detection)
//   GET  /new?title=&body=      hosted report form, used by clients when the relay API is unreachable
//   POST /v1/reports/quick      form submission from /new (urlencoded)
//   GET  /healthz
//
// Everything stays on our server: report text and diagnostics are written to DATA_DIR and announced
// to the operators' WeCom group. No third-party issue tracker is involved.
// Zero dependencies: node:http + node:crypto + node:fs only.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const MAX_JSON_BYTES = 256 * 1024;
const MAX_ARTIFACTS = 24;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
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

function renderOperatorNotice({ ticket, reportId, form, artifactCount, issueUrl, followUp = false }) {
  const env = form.environment ?? {};
  return [
    followUp ? `## 开物问题报告 #${ticket} · 追加反馈` : `## 开物问题报告 #${ticket}`,
    `**${text(form.title, 120) || '（无标题）'}**`,
    `> ${text(form.summary, 300) || '（无概述）'}`,
    `> 严重度：${text(form.severity, 20) || '未填'} · 频率：${text(form.frequency, 20) || '未填'}`,
    `> 版本：${text(env.appVersion, 40) || '?'} · 平台：${text(env.platform, 40) || '?'} · 部署：${text(env.deploymentType, 20) || '?'}`,
    `> 诊断附件：${artifactCount} 份（${form.consent?.includeDiagnostics ? '用户同意附带' : '用户未附带'}）`,
    `> 编号：${reportId}`,
    issueUrl ? `> 链接：${issueUrl}` : '',
  ].filter(Boolean).join('\n');
}

const PAGE_STYLE =
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07070c;color:#e8e6f0;font-family:"PingFang SC","Microsoft YaHei",sans-serif}' +
  'main{width:min(560px,92vw);padding:40px 0}h1{font-size:22px;font-weight:600;margin:0 0 12px}p{color:#a8a3b8;line-height:1.7;margin:0 0 16px}' +
  'label{display:block;font-size:14px;color:#c9c4d8;margin:18px 0 6px}input[type=text],textarea{box-sizing:border-box;width:100%;background:#12121a;border:1px solid #2a2a36;border-radius:10px;color:#e8e6f0;font:inherit;padding:12px}' +
  'textarea{min-height:220px;resize:vertical}.row{display:flex;gap:8px;align-items:flex-start;margin:18px 0}.row label{margin:0;color:#a8a3b8}' +
  'button{margin-top:8px;background:#e8e6f0;color:#07070c;border:0;border-radius:10px;font:inherit;font-weight:600;padding:12px 22px;cursor:pointer}';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function page(heading, message, inner = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>无极开物 · ${escapeHtml(heading)}</title><style>${PAGE_STYLE}</style></head><body><main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p>${inner}</main></body></html>`;
}

function ackPage(ticket) {
  return page(`问题报告 #${ticket} 已收到`, '感谢反馈。开物团队会尽快排查；报告只保存在开物运维服务器上，不会公开。');
}

export function reportFormPage(searchParams) {
  const title = escapeHtml(text(searchParams.get('title'), 200));
  const body = escapeHtml(text(searchParams.get('body'), 20000));
  return page(
    '提交问题报告',
    '报告只保存在开物运维服务器上，由开物团队排查，不会发往任何第三方。',
    `<form method="post" action="v1/reports/quick"><label for="t">标题</label><input id="t" type="text" name="title" maxlength="200" required value="${title}">` +
      `<label for="b">问题描述</label><textarea id="b" name="body" maxlength="20000">${body}</textarea>` +
      `<div class="row"><input id="c" type="checkbox" name="consent" required><label for="c">我同意开物按隐私政策处理本报告</label></div><button type="submit">提交</button></form>`,
  );
}

export function createBugReportRelay(deps = {}) {
  const config = { ...readConfig(), ...(deps.config ?? {}) };
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  if (!config.uploadSecret) throw new Error('UPLOAD_SECRET is required');

  const reportsDir = join(config.dataDir, 'reports');
  const rateBuckets = new Map();
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

    const followUp = await findSubmittedByTicket(Number(body?.issue?.number));
    const ticket = followUp ? followUp.ticket : await nextTicket();
    const issueNumber = ticket;
    const issueUrl = `${config.publicBaseUrl}/v1/reports/${followUp ? followUp.reportId : reportId}`;

    await writeMeta(reportId, { ...meta, status: 'submitted', submittedAt: now().toISOString(), ticket, issueNumber, issueUrl, followUpOf: followUp?.reportId ?? null });
    if (!followUp) rememberSubmitted({ reportId, ticket, title: text(meta.form.title, 200), submittedAt: now().toISOString() });
    await notify(renderOperatorNotice({ ticket, reportId, form: meta.form, artifactCount: meta.artifacts.length, issueUrl, followUp: Boolean(followUp) }));
    return send(res, 200, { reportId, issueNumber, issueUrl });
  }

  // Index of submitted reports for duplicate detection and follow-ups; titles only, never content.
  let submittedIndex = null;
  async function loadSubmittedIndex() {
    if (submittedIndex) return submittedIndex;
    const entries = [];
    for (const id of await readdir(reportsDir).catch(() => [])) {
      if (!REPORT_ID_PATTERN.test(id)) continue;
      const meta = await readMeta(id).catch(() => null);
      if (meta?.status === 'submitted' && !meta.followUpOf) {
        entries.push({ reportId: id, ticket: meta.ticket, title: text(meta.form?.title, 200), submittedAt: meta.submittedAt });
      }
    }
    submittedIndex = entries;
    return entries;
  }
  function rememberSubmitted(entry) {
    if (submittedIndex && !submittedIndex.some((e) => e.ticket === entry.ticket)) submittedIndex.push(entry);
  }
  async function findSubmittedByTicket(ticket) {
    if (!Number.isInteger(ticket) || ticket <= 0) return null;
    return (await loadSubmittedIndex()).find((e) => e.ticket === ticket) ?? null;
  }

  async function similarIssues(res, searchParams) {
    const tokens = text(searchParams.get('q'), 200).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
    if (!tokens.length) return send(res, 200, { issues: [] });
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 10, 25));
    const scored = (await loadSubmittedIndex())
      .map((entry) => {
        const title = entry.title.toLowerCase();
        return { entry, score: tokens.filter((t) => title.includes(t)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.ticket - a.entry.ticket)
      .slice(0, limit);
    return send(res, 200, {
      issues: scored.map(({ entry }) => ({
        owner: 'wuji-labs',
        repo: 'kaiwu',
        number: entry.ticket,
        url: `${config.publicBaseUrl}/v1/reports/${entry.reportId}`,
        title: entry.title,
        state: 'open',
        updatedAt: entry.submittedAt,
      })),
    });
  }

  async function quickSubmit(req, res) {
    if (!allowSession(clientIp(req))) return send(res, 429, page('提交过于频繁', '请稍后再试。'));
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) return send(res, 413, page('内容过长', '请精简描述后再提交。'));
      chunks.push(chunk);
    }
    const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const title = text(fields.get('title'), 200);
    const summary = text(fields.get('body'), 20000);
    if (!title || fields.get('consent') !== 'on') return send(res, 400, page('信息不完整', '请填写标题并勾选同意隐私说明。'));

    const stamp = now().toISOString().slice(0, 10).replace(/-/g, '');
    const reportId = `KW-${stamp}-${randomBytes(4).toString('hex')}`;
    const form = {
      title,
      summary,
      environment: { appVersion: text(fields.get('appVersion'), 40) || 'unknown', platform: 'web-form', deploymentType: 'cloud' },
      consent: { includeDiagnostics: false, acceptedPrivacyNotice: true },
    };
    const ticket = await nextTicket();
    const issueUrl = `${config.publicBaseUrl}/v1/reports/${reportId}`;
    await mkdir(join(reportDir(reportId), 'artifacts'), { recursive: true });
    await writeMeta(reportId, {
      reportId,
      status: 'submitted',
      createdAt: now().toISOString(),
      submittedAt: now().toISOString(),
      clientReportId: 'web-form',
      form,
      artifacts: [],
      ticket,
      issueNumber: ticket,
      issueUrl,
      followUpOf: null,
    });
    rememberSubmitted({ reportId, ticket, title, submittedAt: now().toISOString() });
    await notify(renderOperatorNotice({ ticket, reportId, form, artifactCount: 0, issueUrl, followUp: false }));
    return send(res, 200, ackPage(ticket));
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
      if (req.method === 'GET' && path === '/new') return send(res, 200, reportFormPage(url.searchParams));
      if (req.method === 'POST' && path === '/v1/reports/quick') return await quickSubmit(req, res);

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
      `[bug-report-relay] listening on :${config.port} (wecom: ${Boolean(config.wecomWebhookUrl)})`,
    );
  });
}
