import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { CurrentPointer, ExpoManifest, ExportMetadataFile, ManifestAsset } from './types.js';
import { sha256Base64Url } from './crypto.js';
import { getMimeType } from './mime.js';

export function resolveCurrentPointer(
  dataDir: string,
  runtimeVersion: string,
  platform: string,
  channel: string
): CurrentPointer | null {
  const pointerPath = path.join(dataDir, runtimeVersion, `current-${platform}-${channel}.json`);
  try {
    if (!fs.existsSync(pointerPath)) return null;
    const content = fs.readFileSync(pointerPath, 'utf8');
    return JSON.parse(content) as CurrentPointer;
  } catch {
    return null;
  }
}

export function buildManifest(
  dataDir: string,
  runtimeVersion: string,
  platform: 'ios' | 'android',
  updateId: string,
  publicBaseUrl: string,
  createdAt?: string
): ExpoManifest | null {
  const updateDir = path.join(dataDir, runtimeVersion, updateId);
  if (!fs.existsSync(updateDir) || !fs.statSync(updateDir).isDirectory()) {
    return null;
  }

  // Check if a pre-generated manifest exists
  const prebuiltManifestPath = path.join(updateDir, `manifest-${platform}.json`);
  const genericManifestPath = path.join(updateDir, 'manifest.json');
  const candidatePath = fs.existsSync(prebuiltManifestPath)
    ? prebuiltManifestPath
    : fs.existsSync(genericManifestPath)
      ? genericManifestPath
      : null;

  if (candidatePath) {
    try {
      const manifest = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as ExpoManifest;
      // Re-anchor URLs to current publicBaseUrl if needed
      manifest.launchAsset.url = normalizeAssetUrl(manifest.launchAsset.url, publicBaseUrl, runtimeVersion, platform, updateId);
      for (const asset of manifest.assets) {
        asset.url = normalizeAssetUrl(asset.url, publicBaseUrl, runtimeVersion, platform, updateId);
      }
      return manifest;
    } catch {
      // Fall through to building from metadata.json
    }
  }

  // Build dynamically from metadata.json
  const metadataPath = path.join(updateDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as ExportMetadataFile;
    const platformMetadata = metadata.fileMetadata?.[platform];
    if (!platformMetadata || !platformMetadata.bundle) {
      return null;
    }

    const bundleRelPath = platformMetadata.bundle.replace(/\\/g, '/');
    const fullBundlePath = path.join(updateDir, bundleRelPath);
    if (!fs.existsSync(fullBundlePath)) {
      return null;
    }

    const bundleBuffer = fs.readFileSync(fullBundlePath);
    const bundleHash = sha256Base64Url(bundleBuffer);
    const cleanBaseUrl = publicBaseUrl.replace(/\/+$/, '');

    const launchAsset: ManifestAsset = {
      hash: bundleHash,
      key: bundleHash,
      contentType: 'application/javascript',
      url: `${cleanBaseUrl}/assets?asset=${encodeURIComponent(bundleRelPath)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=${encodeURIComponent(platform)}&updateId=${encodeURIComponent(updateId)}`,
    };

    const assets: ManifestAsset[] = [];
    if (Array.isArray(platformMetadata.assets)) {
      for (const rawAsset of platformMetadata.assets) {
        const assetRelPath = rawAsset.path.replace(/\\/g, '/');
        const fullAssetPath = path.join(updateDir, assetRelPath);
        if (!fs.existsSync(fullAssetPath)) continue;

        const assetBuffer = fs.readFileSync(fullAssetPath);
        const assetHash = sha256Base64Url(assetBuffer);
        const ext = rawAsset.ext ? (rawAsset.ext.startsWith('.') ? rawAsset.ext : `.${rawAsset.ext}`) : path.extname(assetRelPath);

        assets.push({
          hash: assetHash,
          key: assetHash,
          fileExtension: ext,
          contentType: getMimeType(ext),
          url: `${cleanBaseUrl}/assets?asset=${encodeURIComponent(assetRelPath)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=${encodeURIComponent(platform)}&updateId=${encodeURIComponent(updateId)}`,
        });
      }
    }

    // Try reading extra expo config if available
    let extraConfig: Record<string, unknown> = {};
    const extraConfigPath = path.join(updateDir, 'expoConfig.json');
    if (fs.existsSync(extraConfigPath)) {
      try {
        extraConfig = { expoClient: JSON.parse(fs.readFileSync(extraConfigPath, 'utf8')) };
      } catch {
        extraConfig = {};
      }
    }

    const manifest: ExpoManifest = {
      id: updateId,
      createdAt: createdAt || new Date().toISOString(),
      runtimeVersion,
      launchAsset,
      assets,
      metadata: {},
      extra: extraConfig,
    };

    return manifest;
  } catch {
    return null;
  }
}

function normalizeAssetUrl(
  url: string,
  publicBaseUrl: string,
  runtimeVersion: string,
  platform: string,
  updateId: string
): string {
  const cleanBaseUrl = publicBaseUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(url, 'http://localhost');
    const asset = parsed.searchParams.get('asset');
    if (asset) {
      return `${cleanBaseUrl}/assets?asset=${encodeURIComponent(asset)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=${encodeURIComponent(platform)}&updateId=${encodeURIComponent(updateId)}`;
    }
  } catch {
    // If not a parseable URL, return as is
  }
  return url;
}

export function formatMultipartResponse(
  partName: 'manifest' | 'directive',
  bodyJsonString: string,
  signatureHeader?: string
): { boundary: string; contentType: string; buffer: Buffer } {
  const boundary = `----KaiwuOtaBoundary${crypto.randomBytes(8).toString('hex')}`;
  const parts: string[] = [
    `--${boundary}\r\n`,
    `Content-Disposition: inline; name="${partName}"\r\n`,
    `Content-Type: application/json; charset=utf-8\r\n`,
  ];

  if (signatureHeader) {
    parts.push(`expo-signature: ${signatureHeader}\r\n`);
  }

  parts.push(`\r\n`, `${bodyJsonString}\r\n`, `--${boundary}--\r\n`);

  const fullContent = parts.join('');
  return {
    boundary,
    contentType: `multipart/mixed; boundary=${boundary}`,
    buffer: Buffer.from(fullContent, 'utf8'),
  };
}
