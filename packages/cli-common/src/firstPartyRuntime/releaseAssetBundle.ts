import { resolveReleaseAssetBundle } from '@happier-dev/release-runtime/assets';

export type ReleaseAsset = Readonly<{ name: string; url: string }>;

export type ReleaseAssetBundle = Readonly<{
  version: string;
  archive: ReleaseAsset;
  checksums: ReleaseAsset;
  checksumsSig: ReleaseAsset;
}>;

const CLI_RELEASE_PRODUCTS = ['kaiwu', 'happier'] as const;

export function resolveCliBinaryAssetBundleFromReleaseAssets(params: Readonly<{
  assets: unknown;
  os: string;
  arch: string;
  preferVersion: string | null;
}>): ReleaseAssetBundle {
  const os = String(params.os ?? '').trim();
  const arch = String(params.arch ?? '').trim();
  if (!os) throw new Error('os is required');
  if (!arch) throw new Error('arch is required');

  let lastError: unknown = null;
  for (const product of CLI_RELEASE_PRODUCTS) {
    const preferVersion = String(params.preferVersion ?? '').trim() || inferRollingReleaseVersion({
      assets: params.assets,
      os,
      arch,
      product,
    });
    try {
      if (preferVersion) {
        return resolveReleaseAssetBundleForPreferredVersion({
          assets: params.assets,
          os,
          arch,
          product,
          version: preferVersion,
        });
      }

      return resolveReleaseAssetBundle({
        assets: params.assets,
        product,
        os,
        arch,
        preferZipOnWindows: true,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('[release-assets] unable to resolve CLI release asset bundle');
}

function inferRollingReleaseVersion(params: Readonly<{
  assets: unknown;
  os: string;
  arch: string;
  product: string;
}>): string | null {
  const archiveExtensions = params.os.toLowerCase() === 'windows'
    ? ['.zip', '.tar.gz']
    : ['.tar.gz'];
  const archiveBasePrefix = `${params.product}-v`;
  const archiveSuffix = `-${params.os}-${params.arch}`;
  const assets = Array.isArray(params.assets) ? params.assets : [];

  let selectedVersion: string | null = null;
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
    const name = typeof (asset as { name?: unknown }).name === 'string'
      ? (asset as { name: string }).name.trim()
      : '';
    if (!name.startsWith(archiveBasePrefix)) continue;

    for (const extension of archiveExtensions) {
      const expectedSuffix = `${archiveSuffix}${extension}`;
      if (!name.endsWith(expectedSuffix)) continue;
      const version = name.slice(archiveBasePrefix.length, name.length - expectedSuffix.length);
      if (version) {
        selectedVersion = version;
      }
      break;
    }
  }

  return selectedVersion;
}

function resolveReleaseAssetBundleForPreferredVersion(params: Readonly<{
  assets: unknown;
  os: string;
  arch: string;
  product: string;
  version: string;
}>): ReleaseAssetBundle {
  const desiredVersion = params.version;
  const desiredChecksumsName = `checksums-${params.product}-v${desiredVersion}.txt`;
  const desiredChecksumsSigName = `${desiredChecksumsName}.minisig`;
  const desiredArchiveBase = `${params.product}-v${desiredVersion}-${params.os}-${params.arch}`;
  const desiredArchiveNames = params.os.toLowerCase() === 'windows'
    ? [`${desiredArchiveBase}.zip`, `${desiredArchiveBase}.tar.gz`]
    : [`${desiredArchiveBase}.tar.gz`];

  const assets = Array.isArray(params.assets) ? params.assets : [];
  const filteredAssets = assets.filter((asset) => {
    if (!asset || typeof asset !== 'object') return false;
    const name = typeof (asset as { name?: unknown }).name === 'string'
      ? (asset as { name: string }).name.trim()
      : '';
    return (
      name === desiredChecksumsName ||
      name === desiredChecksumsSigName ||
      desiredArchiveNames.includes(name)
    );
  });

  const resolved = resolveReleaseAssetBundle({
    assets: filteredAssets,
    product: params.product,
    os: params.os,
    arch: params.arch,
    preferZipOnWindows: true,
  });
  if (resolved.version !== desiredVersion) {
    throw new Error(`missing CLI archive for requested version ${desiredVersion}`);
  }
  return resolved;
}
