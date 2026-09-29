import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { OtaServerConfig, RollbackDirective } from './types.js';
import { loadPrivateKey, signRsaSha256 } from './crypto.js';
import { buildManifest, formatMultipartResponse, resolveCurrentPointer } from './manifest.js';
import { getMimeType } from './mime.js';

export function createOtaServer(config: OtaServerConfig): http.Server {
  const dataDir = path.resolve(config.dataDir);
  const privateKey = loadPrivateKey(config.privateKeyPath);
  const publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');

  const server = http.createServer((req, res) => {
    try {
      handleRequest(req, res, { dataDir, privateKey, publicBaseUrl });
    } catch (err) {
      console.error('[ota-server] Internal error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  return server;
}

interface RequestContext {
  dataDir: string;
  privateKey: string | null;
  publicBaseUrl: string;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, ctx: RequestContext): void {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const rawUrl = req.url || '/';
  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  // 1. Health check: /ota/healthz or /healthz
  if (pathname === '/ota/healthz' || pathname === '/healthz') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // 2. Manifest endpoint: /ota/api/manifest or /api/manifest
  if (pathname === '/ota/api/manifest' || pathname === '/api/manifest') {
    handleManifestRequest(req, res, ctx);
    return;
  }

  // 3. Assets endpoint: /ota/assets or /assets
  if (pathname === '/ota/assets' || pathname === '/assets') {
    handleAssetRequest(req, res, parsedUrl, ctx);
    return;
  }

  // Unknown route
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
}

function handleManifestRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RequestContext
): void {
  const platformHeader = (req.headers['expo-platform'] as string | undefined)?.toLowerCase();
  const runtimeVersion = (req.headers['expo-runtime-version'] as string | undefined)?.trim();
  const channel = ((req.headers['expo-channel-name'] as string | undefined) || 'production').trim();
  const expectSignature = req.headers['expo-expect-signature'] as string | undefined;
  // One line per check-in so we can see which devices ask for updates and what they were given.
  res.on('finish', () => {
    console.log(
      `[ota-server] manifest ${res.statusCode} platform=${platformHeader ?? '-'} runtime=${runtimeVersion ?? '-'} ` +
        `channel=${channel} current=${String(req.headers['expo-current-update-id'] ?? '-')} ` +
        `embedded=${String(req.headers['expo-embedded-update-id'] ?? '-')} sig=${expectSignature ? 'yes' : 'no'} ` +
        `ua="${String(req.headers['user-agent'] ?? '')}"`,
    );
  });

  if (!platformHeader || (platformHeader !== 'ios' && platformHeader !== 'android')) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing or invalid expo-platform header (must be ios or android)' }));
    return;
  }

  if (!runtimeVersion) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing expo-runtime-version header' }));
    return;
  }

  const pointer = resolveCurrentPointer(ctx.dataDir, runtimeVersion, platformHeader, channel);

  // If no pointer file or no valid update pointer: return 204 No Content
  if (!pointer) {
    res.statusCode = 204;
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('cache-control', 'private, max-age=0');
    res.end();
    return;
  }

  // Handle Rollback directive
  if (pointer.rollback) {
    const directive: RollbackDirective = {
      type: 'rollBackToEmbedded',
      parameters: {
        commitTime: pointer.commitTime || pointer.createdAt || new Date().toISOString(),
      },
    };
    const directiveString = JSON.stringify(directive);
    let signatureHeader: string | undefined;
    if (expectSignature && ctx.privateKey) {
      signatureHeader = signRsaSha256(directiveString, ctx.privateKey);
    }

    const { contentType, buffer } = formatMultipartResponse('directive', directiveString, signatureHeader);

    res.statusCode = 200;
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('cache-control', 'private, max-age=0');
    res.setHeader('content-type', contentType);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(buffer);
    return;
  }

  // Normal update manifest
  if (!pointer.updateId) {
    res.statusCode = 204;
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('cache-control', 'private, max-age=0');
    res.end();
    return;
  }

  const manifest = buildManifest(
    ctx.dataDir,
    runtimeVersion,
    platformHeader,
    pointer.updateId,
    ctx.publicBaseUrl,
    pointer.createdAt
  );

  if (!manifest) {
    res.statusCode = 204;
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('cache-control', 'private, max-age=0');
    res.end();
    return;
  }

  const manifestString = JSON.stringify(manifest);
  let signatureHeader: string | undefined;
  if (expectSignature && ctx.privateKey) {
    signatureHeader = signRsaSha256(manifestString, ctx.privateKey);
  }

  const { contentType, buffer } = formatMultipartResponse('manifest', manifestString, signatureHeader);

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', '1');
  res.setHeader('expo-sfv-version', '0');
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', contentType);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(buffer);
}

function handleAssetRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  ctx: RequestContext
): void {
  const rawAsset = parsedUrl.searchParams.get('asset');
  const runtimeVersion = parsedUrl.searchParams.get('runtimeVersion');
  const platform = parsedUrl.searchParams.get('platform') || 'ios';
  const updateId = parsedUrl.searchParams.get('updateId');
  const channel = parsedUrl.searchParams.get('channel') || 'production';

  if (!rawAsset || !runtimeVersion) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing required query parameters: asset and runtimeVersion' }));
    return;
  }

  // 1. Path traversal checks on raw parameter
  if (
    rawAsset.includes('\0') ||
    rawAsset.startsWith('/') ||
    rawAsset.startsWith('\\') ||
    rawAsset.includes('..') ||
    rawAsset.includes('%2e%2e') ||
    rawAsset.includes('%2E%2E')
  ) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Path traversal detected in asset parameter' }));
    return;
  }

  let decodedAsset: string;
  try {
    decodedAsset = decodeURIComponent(rawAsset);
  } catch {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid URL encoding in asset parameter' }));
    return;
  }

  // Double check decoded asset
  if (
    decodedAsset.includes('\0') ||
    decodedAsset.startsWith('/') ||
    decodedAsset.startsWith('\\') ||
    decodedAsset.split(/[/\\]/).includes('..')
  ) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Path traversal detected in decoded asset path' }));
    return;
  }

  // Determine base target directory
  let targetUpdateDir: string;
  if (updateId) {
    // Also protect updateId from traversal
    if (updateId.includes('..') || updateId.includes('/') || updateId.includes('\\')) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid updateId' }));
      return;
    }
    targetUpdateDir = path.resolve(ctx.dataDir, runtimeVersion, updateId);
  } else {
    // Resolve current pointer
    const pointer = resolveCurrentPointer(ctx.dataDir, runtimeVersion, platform, channel);
    if (pointer && pointer.updateId) {
      targetUpdateDir = path.resolve(ctx.dataDir, runtimeVersion, pointer.updateId);
    } else {
      targetUpdateDir = path.resolve(ctx.dataDir, runtimeVersion);
    }
  }

  const resolvedDataDir = path.resolve(ctx.dataDir);
  const resolvedTargetFile = path.resolve(targetUpdateDir, decodedAsset);

  // Guard against traversal outside dataDir
  if (
    !resolvedTargetFile.startsWith(resolvedDataDir + path.sep) &&
    resolvedTargetFile !== resolvedDataDir
  ) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Forbidden: Path outside data directory' }));
    return;
  }

  // Check file existence
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedTargetFile);
    if (!stat.isFile()) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Asset is not a regular file' }));
      return;
    }
  } catch {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Asset not found' }));
    return;
  }

  const mimeType = getMimeType(resolvedTargetFile);
  res.statusCode = 200;
  res.setHeader('content-type', mimeType);
  res.setHeader('content-length', stat.size);
  res.setHeader('cache-control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const readStream = fs.createReadStream(resolvedTargetFile);
  readStream.pipe(res);
}
