// @ts-check

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { normalizePublicReleaseChannel, resolveRollingReleaseTagSuffix } from '../lib/public-release-rings.mjs';

/**
 * Installer publishing catalog for apps/website/public (served on kaiwu.wujilabs.cn).
 *
 * Every published installer endpoint has exactly one owner:
 *
 * - `kaiwu`: the 无极开物 installers. `install.sh` / `install.ps1` under apps/website/public are
 *   the canonical sources themselves: they are edited in place on every CLI release (fallback
 *   version + sha256, see docs/release-runbook.md), uploaded to COS from that location, and
 *   install the COS-hosted Kaiwu artifacts with sha256 verification. Their mirrors (e.g. the
 *   extensionless `install`) are byte copies of the canonical file.
 * - `kaiwu-unsupported`: endpoints the upstream catalog publishes (preview/dev channels, the
 *   server wrapper) that 无极开物 does not ship. They are generated as fail-closed stubs that
 *   print guidance and exit non-zero, so a kaiwu domain can never install upstream artifacts.
 * - `template`: files rendered from the upstream release-owned sources under
 *   scripts/release/installers. The upstream installer template itself is kept and tested there,
 *   but it resolves upstream GitHub releases, so it is never published to a kaiwu endpoint.
 *
 * @typedef {'kaiwu' | 'kaiwu-unsupported' | 'template'} InstallerOwner
 * @typedef {{ lane: 'preview' | 'dev' | 'server'; shell: 'sh' | 'ps1' }} UnsupportedInstallerStub
 * @typedef {{
 *   id: string;
 *   owner: InstallerOwner;
 *   targets: readonly string[];
 *   source?: string;
 *   transform?: string;
 *   stub?: UnsupportedInstallerStub;
 * }} InstallerPublishSpec
 */

export const KAIWU_STABLE_INSTALL_URL_UNIX = 'https://kaiwu.wujilabs.cn/install';
export const KAIWU_STABLE_INSTALL_URL_WINDOWS = 'https://kaiwu.wujilabs.cn/install.ps1';
export const KAIWU_SELF_HOSTING_DOCS_URL = 'https://kaiwu.wujilabs.cn/docs/self-hosting/docker';
export const KAIWU_SERVER_DOWNLOAD_URL = 'https://kaiwu.wujilabs.cn/download/server';

/** @type {readonly InstallerPublishSpec[]} */
export const INSTALLER_PUBLISH_SPECS = Object.freeze([
  { id: 'kaiwu-cli-unix', owner: 'kaiwu', source: 'install.sh', targets: ['install.sh', 'install'] },
  { id: 'kaiwu-cli-windows', owner: 'kaiwu', source: 'install.ps1', targets: ['install.ps1'] },
  {
    id: 'kaiwu-cli-preview-unix',
    owner: 'kaiwu-unsupported',
    stub: { lane: 'preview', shell: 'sh' },
    targets: ['install-preview.sh', 'install-preview'],
  },
  {
    id: 'kaiwu-cli-dev-unix',
    owner: 'kaiwu-unsupported',
    stub: { lane: 'dev', shell: 'sh' },
    targets: ['install-dev.sh', 'install-dev'],
  },
  {
    id: 'kaiwu-cli-preview-windows',
    owner: 'kaiwu-unsupported',
    stub: { lane: 'preview', shell: 'ps1' },
    targets: ['install-preview.ps1'],
  },
  {
    id: 'kaiwu-cli-dev-windows',
    owner: 'kaiwu-unsupported',
    stub: { lane: 'dev', shell: 'ps1' },
    targets: ['install-dev.ps1'],
  },
  {
    id: 'kaiwu-server-unix',
    owner: 'kaiwu-unsupported',
    stub: { lane: 'server', shell: 'sh' },
    targets: ['install-server', 'install-server.sh'],
  },
  { id: 'release-pubkey', owner: 'template', source: 'happier-release.pub', targets: ['happier-release.pub'] },
]);

export const INSTALLER_FILENAMES = INSTALLER_PUBLISH_SPECS.flatMap((spec) => spec.targets);

/**
 * Upstream template publish specs: how the release-owned installer template under
 * scripts/release/installers derives its channel variants. Kept so the template transforms stay
 * covered by contracts, but NOT published to kaiwu endpoints (see INSTALLER_PUBLISH_SPECS).
 * @type {readonly { source: string; channel: 'stable' | 'preview' | 'dev'; transform?: string }[]}
 */
export const UPSTREAM_TEMPLATE_INSTALLER_VARIANTS = Object.freeze([
  { source: 'install.sh', channel: 'stable' },
  { source: 'install.sh', channel: 'preview', transform: 'preview-default-channel' },
  { source: 'install.sh', channel: 'dev', transform: 'publicdev-default-channel' },
  { source: 'install.ps1', channel: 'stable' },
  { source: 'install.ps1', channel: 'preview', transform: 'preview-default-channel' },
  { source: 'install.ps1', channel: 'dev', transform: 'publicdev-default-channel' },
]);

/**
 * @param {{ platform: 'linux' | 'darwin' | 'win32'; channel: string }} params
 */
export function resolvePublishedInstallerAsset({ platform, channel }) {
  const normalizedChannel = normalizePublicReleaseChannel(channel);
  if (!normalizedChannel) {
    throw new Error(`Unsupported installer release channel: ${channel}`);
  }

  const installerBase =
    normalizedChannel === 'stable'
      ? 'install'
      : normalizedChannel === 'preview'
        ? 'install-preview'
        : 'install-dev';

  return {
    tag: `cli-${resolveRollingReleaseTagSuffix(normalizedChannel)}`,
    installer: platform === 'win32' ? `${installerBase}.ps1` : `${installerBase}.sh`,
  };
}

/**
 * @param {string} tag
 * @returns {'stable' | 'preview' | 'publicdev'}
 */
export function resolvePublishedInstallerChannelForTag(tag) {
  const value = String(tag ?? '').trim();
  if (!value) {
    throw new Error('Missing published installer tag');
  }
  if (value === 'cli-stable' || /^cli-v\d+\.\d+\.\d+$/.test(value)) {
    return 'stable';
  }
  if (value === 'cli-preview' || /^cli-v\d+\.\d+\.\d+-preview\./.test(value)) {
    return 'preview';
  }
  if (value === 'cli-dev' || /^cli-v\d+\.\d+\.\d+-dev\./.test(value)) {
    return 'publicdev';
  }
  throw new Error(`Unsupported installer release tag: ${value}`);
}

/**
 * @param {{ platform: 'linux' | 'darwin' | 'win32'; tag: string }} params
 */
export function resolvePublishedInstallerAssetForTag({ platform, tag }) {
  const channel = resolvePublishedInstallerChannelForTag(tag);
  const resolved = resolvePublishedInstallerAsset({ platform, channel });
  return {
    tag: String(tag ?? '').trim(),
    installer: resolved.installer,
  };
}

function replacePowerShellDefaultChannel(raw, channel) {
  return raw.replace(
    /(\[string\] \$Channel = \$\(if \(\$env:HAPPIER_CHANNEL\) \{ \$env:HAPPIER_CHANNEL \} else \{ ")(stable)(" \}\),)/,
    `$1${channel}$3`,
  );
}

/**
 * Channel transforms for the upstream installer template (scripts/release/installers).
 * @param {Buffer} contents
 * @param {string | undefined} transform
 */
export function applyInstallerPublishTransform(contents, transform) {
  if (!transform) return contents;
  const raw = contents.toString('utf8');
  if (transform === 'preview-default-channel') {
    const shellUpdated = raw.replaceAll('HAPPIER_CHANNEL:-stable', 'HAPPIER_CHANNEL:-preview');
    const ps1Updated = replacePowerShellDefaultChannel(shellUpdated, 'preview');
    return Buffer.from(ps1Updated, 'utf8');
  }
  if (transform === 'publicdev-default-channel') {
    const shellUpdated = raw.replaceAll('HAPPIER_CHANNEL:-stable', 'HAPPIER_CHANNEL:-dev');
    const ps1Updated = replacePowerShellDefaultChannel(shellUpdated, 'dev');
    return Buffer.from(ps1Updated, 'utf8');
  }
  throw new Error(`[release] unknown installer transform: ${transform}`);
}

/**
 * @param {UnsupportedInstallerStub} stub
 */
function describeUnsupportedLane(stub) {
  if (stub.lane === 'server') {
    return {
      headline: '无极开物暂不提供服务端一键安装脚本，本入口已停用。',
      guidance: [
        `自托管服务端请按文档用 Docker 部署：${KAIWU_SELF_HOSTING_DOCS_URL}`,
        `服务端核心安装包：${KAIWU_SERVER_DOWNLOAD_URL}`,
      ],
      reason: 'Kaiwu publishes no server install script; this endpoint fails closed.',
    };
  }
  return {
    headline: `无极开物暂未开放 ${stub.lane} 通道的 CLI 安装包，本入口已停用。`,
    guidance: [
      `请改用正式版（macOS / Linux）：curl -fsSL ${KAIWU_STABLE_INSTALL_URL_UNIX} | bash`,
      `Windows（PowerShell）：irm ${KAIWU_STABLE_INSTALL_URL_WINDOWS} | iex`,
    ],
    reason: `Kaiwu publishes no ${stub.lane} CLI channel; this endpoint fails closed.`,
  };
}

/**
 * Renders a fail-closed installer stub for an endpoint 无极开物 does not ship.
 * @param {UnsupportedInstallerStub} stub
 * @returns {string}
 */
export function renderKaiwuUnsupportedInstaller(stub) {
  const { headline, guidance, reason } = describeUnsupportedLane(stub);
  const banner = [
    '无极开物 · 已停用的安装入口',
    `Generated by scripts/pipeline/release/installers/catalog.mjs (owner: kaiwu-unsupported, lane: ${stub.lane}).`,
    `${reason} It never downloads or installs anything.`,
    'Do not edit by hand: run `yarn release:sync:installers`.',
  ];
  if (stub.shell === 'sh') {
    const quote = (line) => `'${line.replaceAll("'", `'"'"'`)}'`;
    return [
      '#!/usr/bin/env bash',
      ...banner.map((line) => `# ${line}`),
      'set -euo pipefail',
      '',
      `printf '%s\\n' ${quote(`[错误] ${headline}`)} >&2`,
      ...guidance.map((line) => `printf '%s\\n' ${quote(line)} >&2`),
      'exit 1',
      '',
    ].join('\n');
  }
  if (stub.shell === 'ps1') {
    const quote = (line) => `'${line.replaceAll("'", "''")}'`;
    return [
      ...banner.map((line) => `# ${line}`),
      '& {',
      `  Write-Host ${quote(`[错误] ${headline}`)} -ForegroundColor Red`,
      ...guidance.map((line) => `  Write-Host ${quote(line)} -ForegroundColor Yellow`),
      `  throw ${quote(headline)}`,
      '}',
      '',
    ].join('\n');
  }
  throw new Error(`[release] unknown installer stub shell: ${String(stub.shell)}`);
}

/**
 * Resolves where a spec's source bytes live, or null for generated stubs.
 * @param {{ spec: InstallerPublishSpec; sourceDir: string; targetDir: string }} params
 */
export function resolveInstallerSpecSourcePath({ spec, sourceDir, targetDir }) {
  if (spec.owner === 'kaiwu-unsupported') return null;
  if (!spec.source) throw new Error(`[release] installer spec ${spec.id} is missing a source`);
  return spec.owner === 'kaiwu' ? join(targetDir, spec.source) : join(sourceDir, spec.source);
}

/**
 * Renders the exact bytes every target of `spec` must contain.
 * @param {{ spec: InstallerPublishSpec; sourceDir: string; targetDir: string }} params
 * @returns {Promise<Buffer>}
 */
export async function renderInstallerPublishSpec({ spec, sourceDir, targetDir }) {
  if (spec.owner === 'kaiwu-unsupported') {
    if (!spec.stub) throw new Error(`[release] installer spec ${spec.id} is missing a stub definition`);
    return Buffer.from(renderKaiwuUnsupportedInstaller(spec.stub), 'utf8');
  }
  const sourcePath = /** @type {string} */ (resolveInstallerSpecSourcePath({ spec, sourceDir, targetDir }));
  let contents;
  try {
    contents = await readFile(sourcePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      const hint = spec.owner === 'kaiwu' ? ' (canonical 无极开物 installer; it lives in the published directory)' : '';
      throw new Error(`[release] missing installer source file: ${sourcePath}${hint}`);
    }
    throw error;
  }
  return spec.owner === 'template' ? applyInstallerPublishTransform(contents, spec.transform) : contents;
}
