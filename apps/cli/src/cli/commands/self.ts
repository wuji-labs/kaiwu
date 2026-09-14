import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import packageJson from '../../../package.json';
import { normalizeBrandEnv } from '@happier-dev/cli-common';
import { configuration } from '@/configuration';
import type { CommandContext } from '@/cli/commandRegistry';
import {
  FIRST_PARTY_COMPONENT_IDS,
  installVersionedPayload,
  resolveInstalledFirstPartyComponentPaths,
  resolveFirstPartyComponentPublicReleaseVariant,
  resolveManagedCliReleaseChannelSync,
  resolveManagedCliToolNameForRing,
} from '@happier-dev/cli-common/firstPartyRuntime';
import type { FirstPartyComponentId } from '@happier-dev/cli-common/firstPartyRuntime';
import { createStepPrinter } from '@happier-dev/cli-common/output';
import {
  compareVersions,
  readNpmDistTagVersion,
  readUpdateCache,
  resolveNpmPackageNameOverride,
  writeUpdateCache,
} from '@happier-dev/cli-common/update';
import { fetchGitHubReleaseByTag } from '@happier-dev/release-runtime/github';
import {
  getReleaseRingCatalogEntry,
  getReleaseRingPublicLabel,
  normalizePublicReleaseRingId,
  type PublicReleaseRingId,
} from '@happier-dev/release-runtime/releaseRings';
import {
  resolveCliBinaryAssetBundleFromReleaseAssets,
  updateInstalledCliPayloadFromReleaseAssets,
} from '@/cli/runtime/update/binarySelfUpdate';
import { handleSelfMigrateCommand } from './self/handleSelfMigrateCommand';
import { maybeRunVersionGatedRuntimeMigration } from './self/maybeRunVersionGatedRuntimeMigration';
import { maybeRunDoctorRepair } from './self/maybeRunDoctorRepair';
import { quiesceInstalledCliWindowsPayloadOwners } from '@/cli/runtime/update/quiesceInstalledCliWindowsPayloadOwners';

type SelfChannel = PublicReleaseRingId;

function usage(): string {
  return [
    `${chalk.bold('kaiwu self')} - 自更新与更新检查`,
    '',
    `${chalk.bold('用法:')}`,
    `  kaiwu self check [--preview|--dev|--channel=<preview|dev>] [--quiet]`,
    `  kaiwu self update [--preview|--dev|--channel=<preview|dev>] [--to <versionOrTag>]`,
    `  kaiwu self migrate [--yes] [--json]`,
    `  kaiwu self-update [--check] [--preview|--dev|--channel=<preview|dev>] [--to <versionOrTag>]`,
    '',
    `${chalk.bold('通道:')}`,
    `  stable  → npm dist-tag ${chalk.cyan('latest')}`,
    `  preview → npm dist-tag ${chalk.cyan('next')}`,
    `  dev     → npm dist-tag ${chalk.cyan('next')}（${chalk.gray('dev 滚动二进制版本')}）`,
    '',
    `${chalk.bold('环境变量:')}`,
    `  HAPPIER_CLI_UPDATE_CHECK=0                 禁用更新提示和后台检查`,
    `  HAPPIER_CLI_UPDATE_PACKAGE_NAME=@scope/pkg 覆盖要检查/安装的 npm 包名`,
    `  KAIWU_GITHUB_REPO=wuji-labs/kaiwu           覆盖二进制更新使用的 GitHub 仓库（或 HAPPIER_GITHUB_REPO）`,
    `  HAPPIER_GITHUB_TOKEN=...                   GitHub 发布 API 令牌（可选）`,
    '',
  ].join('\n');
}

function isSafeNpmNameSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

function isSafeUpdateTarget(value: string): boolean {
  // Accept npm dist-tags and exact semver-like versions only.
  return /^(?:latest|next|[A-Za-z0-9][A-Za-z0-9._-]*|v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.test(value);
}

export function packageJsonPathForNodeModules({ rootDir, packageName }: { rootDir: string; packageName: string }): string | null {
  const name = String(packageName ?? '').trim();
  if (!name) return null;
  const parts = name.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) return null;

  if (name.startsWith('@')) {
    if (parts.length !== 2) return null;
    const [scope, pkg] = parts;
    if (!scope?.startsWith('@')) return null;
    if (!isSafeNpmNameSegment(scope.slice(1))) return null;
    if (!isSafeNpmNameSegment(pkg ?? '')) return null;
  } else {
    if (parts.length !== 1) return null;
    if (!isSafeNpmNameSegment(parts[0] ?? '')) return null;
  }

  return join(rootDir, 'node_modules', ...parts, 'package.json');
}

function readPackageJsonVersion(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const v = String(parsed?.version ?? '').trim();
    return v || null;
  } catch {
    return null;
  }
}

function resolveSelfNpmDistTag(channel: SelfChannel): 'latest' | 'next' {
  return channel === 'stable' ? 'latest' : 'next';
}

/**
 * The `next` npm dist-tag is shared by both preview and dev channels. When
 * `npm view @happier-dev/cli@next version` returns a version, it might be from
 * either channel. Verify the fetched version's prerelease identifier matches
 * the channel we're on — otherwise we'd announce "update available" across
 * channels (e.g. dev 0.2.5 being "updated" to preview 0.2.2).
 *
 * Prerelease tag contracts:
 *  - stable:  no prerelease identifier (e.g. "0.2.3")
 *  - preview: "-preview." prerelease (e.g. "0.2.3-preview.17...")
 *  - dev:     "-dev." prerelease     (e.g. "0.2.5-dev.17...")
 */
export function doesVersionMatchChannel(version: string | null, channel: SelfChannel): boolean {
  const v = String(version ?? '').trim();
  if (!v) return false;
  const prereleaseIndex = v.indexOf('-');
  const prerelease = prereleaseIndex >= 0 ? v.slice(prereleaseIndex + 1) : '';
  if (channel === 'stable') {
    return prerelease === '';
  }
  if (channel === 'preview') {
    return prerelease.startsWith('preview.') || prerelease === 'preview';
  }
  // publicdev
  return prerelease.startsWith('dev.') || prerelease === 'dev';
}

function resolveSelfReleaseChannel(params: Readonly<{
  args: readonly string[];
  rawArgv?: readonly string[];
  invokedPath?: string | null;
}>): ReturnType<typeof resolveManagedCliReleaseChannelSync> {
  return resolveManagedCliReleaseChannelSync({
    args: params.args,
    argv: params.rawArgv ?? process.argv,
    invokedPath: params.invokedPath ?? process.argv[1] ?? '',
    processEnv: process.env,
  });
}

export function parseSelfChannel(args: string[], invokedPath = process.argv[1] ?? ''): SelfChannel {
  return resolveSelfReleaseChannel({ args, invokedPath }).ringId;
}

export function computeSelfUpdateSpec(params: Readonly<{ packageName: string; channel: SelfChannel; to: string }>): string {
  const pkg = String(params.packageName ?? '').trim();
  const to = String(params.to ?? '').trim();
  if (to) {
    if (!isSafeUpdateTarget(to)) {
      throw new Error(`无效的 --to 值：${to}`);
    }
    return `${pkg}@${to}`;
  }
  return `${pkg}@${resolveSelfNpmDistTag(params.channel)}`;
}

export function detectInstallSource(path: string): 'npm' | 'binary' {
  const raw = String(path ?? '').trim();
  const normalized = raw.replace(/\\/g, '/');
  if (normalized.includes('/node_modules/')) return 'npm';
  return 'binary';
}

function resolveBinaryUpdateRepo(env: NodeJS.ProcessEnv): string {
  const raw = String(normalizeBrandEnv('KAIWU_GITHUB_REPO') ?? '').trim();
  return raw || 'wuji-labs/kaiwu';
}

function resolveBinaryUpdateToken(env: NodeJS.ProcessEnv): string {
  return String(env.HAPPIER_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? '').trim();
}

function resolveBinaryUpdatePlatform(env: NodeJS.ProcessEnv): Readonly<{ os: string; arch: string }> {
  const forcedOs = String(env.HAPPIER_SELF_UPDATE_OS ?? '').trim();
  const forcedArch = String(env.HAPPIER_SELF_UPDATE_ARCH ?? '').trim();
  if (forcedOs && forcedArch) return { os: forcedOs, arch: forcedArch };

  const os = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'unsupported';
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'unsupported';
  if (os === 'unsupported' || arch === 'unsupported') {
    throw new Error(`当前平台不支持二进制更新：${process.platform}/${process.arch}`);
  }
  return { os, arch };
}

function resolveBinaryUpdateTag(channel: SelfChannel): string {
  return resolveFirstPartyComponentPublicReleaseVariant({
    componentId: 'happier-cli',
    channel,
  }).releaseTag;
}

function npmUpgradeCommand(params: Readonly<{ packageName: string; channel: SelfChannel; to: string }>): string {
  const pkg = String(params.packageName ?? '').trim();
  const to = String(params.to ?? '').trim();
  if (to) return `npm install -g ${pkg}@${to}`;
  return `npm install -g ${pkg}@${resolveSelfNpmDistTag(params.channel)}`;
}

function resolvePublicReleaseRingSuffix(ring: SelfChannel): 'stable' | 'preview' | 'dev' {
  return getReleaseRingPublicLabel(ring);
}

function updateCachePath(channel: SelfChannel): string {
  const suffix = resolvePublicReleaseRingSuffix(channel);
  const fileName = suffix === 'stable' ? 'update.json' : `update.${suffix}.json`;
  return join(configuration.happyHomeDir, 'cache', fileName);
}

function runtimeDir(channel: SelfChannel): string {
  const suffix = resolvePublicReleaseRingSuffix(channel);
  return suffix === 'stable'
    ? join(configuration.happyHomeDir, 'runtime')
    : join(configuration.happyHomeDir, `runtime.${suffix}`);
}

function resolveUpdatePackageName(): string {
  return resolveNpmPackageNameOverride({
    envValue: process.env.HAPPIER_CLI_UPDATE_PACKAGE_NAME,
    fallback: String(packageJson.name ?? '').trim(),
  });
}

async function runSelfUpdateStep<T>(
  steps: ReturnType<typeof createStepPrinter>,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  steps.start(label);
  try {
    const result = await fn();
    steps.stop('✓', label);
    return result;
  } catch (error) {
    steps.stop('x', label);
    throw error;
  }
}

async function cmdCheck(argv: string[], rawArgv: readonly string[] = process.argv): Promise<void> {
  const channelResolution = resolveSelfReleaseChannel({ args: argv, rawArgv });
  const channel = channelResolution.ringId;
  const quiet = argv.includes('--quiet');
  const installSource = detectInstallSource(process.argv[1] ?? '');

  if (installSource === 'binary') {
    if (process.platform === 'win32') {
      const currentVersion = configuration.currentCliVersion || 'unknown';
      console.log('Windows 上的开物 CLI 通过安装脚本更新：irm https://kaiwu.chengqiyun.com/install.ps1 | iex');
      console.log(`当前版本：${currentVersion}`);
      process.exit(0);
    }

    const { os, arch } = resolveBinaryUpdatePlatform(process.env);
    const githubRepo = resolveBinaryUpdateRepo(process.env);
    const githubToken = resolveBinaryUpdateToken(process.env);
    const tag = resolveBinaryUpdateTag(channel);

    const release = await fetchGitHubReleaseByTag({ githubRepo, tag, githubToken, userAgent: 'happier-cli' });
    const assets = typeof release === 'object' && release != null && 'assets' in release ? (release as any).assets : null;
    const bundle = resolveCliBinaryAssetBundleFromReleaseAssets({ assets, os, arch, preferVersion: null });

    const latest = bundle.version;
    const invokerVersion = configuration.currentCliVersion;
    const current = invokerVersion || null;
    const updateAvailable = Boolean(current && latest && compareVersions(latest, current) > 0);

    const existing = readUpdateCache(updateCachePath(channel));
    const checkedAt = Date.now();
    writeUpdateCache(updateCachePath(channel), {
      checkedAt,
      latest,
      current,
      runtimeVersion: null,
      invokerVersion,
      updateAvailable,
      notifiedAt: existing?.notifiedAt ?? null,
    });

    if (quiet) return;

    if (updateAvailable) {
      console.log(chalk.yellow(`发现新版本：${current ?? '当前版本'} → ${latest}`));
      console.log(chalk.gray('运行：'), chalk.cyan(`${resolveManagedCliToolNameForRing(channel)} self update`));
      return;
    }
    console.log(chalk.green('已是最新版本。'));
    return;
  }
  const distTag = resolveSelfNpmDistTag(channel);
  const pkgName = resolveUpdatePackageName();

  const runtimePkgJson = packageJsonPathForNodeModules({ rootDir: runtimeDir(channel), packageName: pkgName });
  const runtimeVersion = runtimePkgJson ? readPackageJsonVersion(runtimePkgJson) : null;
  const invokerVersion = configuration.currentCliVersion;
  const current = runtimeVersion || invokerVersion || null;

  const rawLatest = readNpmDistTagVersion({ packageName: pkgName, distTag, cwd: process.cwd(), env: process.env });
  // Reject cross-channel results (preview/dev share the `next` dist-tag).
  const latest = doesVersionMatchChannel(rawLatest, channel) ? rawLatest : null;
  const updateAvailable = Boolean(current && latest && compareVersions(latest, current) > 0);

  const existing = readUpdateCache(updateCachePath(channel));
  const checkedAt = Date.now();
  writeUpdateCache(updateCachePath(channel), {
    checkedAt,
    latest,
    current,
    runtimeVersion,
    invokerVersion,
    updateAvailable,
    notifiedAt: existing?.notifiedAt ?? null,
  });

  if (quiet) return;

  if (!latest) {
    console.log(chalk.gray('无法确定最新版本（npm view 失败）。'));
    return;
  }
  if (updateAvailable) {
    console.log(chalk.yellow(`发现新版本：${current ?? '当前版本'} → ${latest}`));
    console.log(chalk.gray('运行：'), chalk.cyan(`${resolveManagedCliToolNameForRing(channel)} self update`));
    return;
  }
  console.log(chalk.green('已是最新版本。'));
}

async function cmdUpdate(argv: string[], rawArgv: readonly string[] = process.argv): Promise<void> {
  const channelResolution = resolveSelfReleaseChannel({ args: argv, rawArgv });
  const channel = channelResolution.ringId;
  const steps = createStepPrinter({ enabled: true });
  const toArg = (() => {
    const i = argv.indexOf('--to');
    if (i >= 0) return argv[i + 1] ?? '';
    const eq = argv.find((a) => a.startsWith('--to='));
    return eq ? eq.slice('--to='.length) : '';
  })();

  const installSource = detectInstallSource(process.argv[1] ?? '');
  if (installSource === 'binary') {
    if (process.platform === 'win32') {
      console.log('Windows 上的开物 CLI 通过安装脚本更新：irm https://kaiwu.chengqiyun.com/install.ps1 | iex');
      process.exit(0);
    }
  }

  if (installSource === 'npm') {
    const pkgName = resolveUpdatePackageName();
    const upgrade = npmUpgradeCommand({ packageName: pkgName, channel, to: toArg });
    console.log(chalk.yellow('检测到通过 npm 安装；已禁用原地运行时更新。'));
    console.log(chalk.gray('请改为运行：'), chalk.cyan(upgrade));
    return;
  }

  const effective = (() => {
    const raw = String(toArg ?? '').trim();
    if (raw === 'latest') return { channel: 'stable' as const, preferVersion: null };
    if (raw === 'next') return { channel: 'preview' as const, preferVersion: null };
    const v = raw.startsWith('v') ? raw.slice(1) : raw;
    return { channel, preferVersion: v || null };
  })();

  const { os, arch } = resolveBinaryUpdatePlatform(process.env);
  const githubRepo = resolveBinaryUpdateRepo(process.env);
  const githubToken = resolveBinaryUpdateToken(process.env);
  const tag = resolveBinaryUpdateTag(effective.channel);
  const minisignPubkeyFile = String(process.env.HAPPIER_MINISIGN_PUBKEY ?? '').trim() || undefined;
  const release = await runSelfUpdateStep(steps, '正在解析发布元数据', async () => {
    return await fetchGitHubReleaseByTag({
      githubRepo,
      tag,
      githubToken,
      userAgent: 'happier-cli',
    });
  });
  const assets = typeof release === 'object' && release != null && 'assets' in release ? (release as any).assets : null;
  resolveCliBinaryAssetBundleFromReleaseAssets({
    assets,
    os,
    arch,
    preferVersion: effective.preferVersion,
  });

  await quiesceInstalledCliWindowsPayloadOwners({
    channel: effective.channel,
    processEnv: {
      ...process.env,
      HAPPIER_HOME_DIR: configuration.happyHomeDir,
    },
  });

  const result = await runSelfUpdateStep(steps, '正在下载并安装运行包', async () => {
    return await updateInstalledCliPayloadFromReleaseAssets({
      assets,
      os,
      arch,
      happyHomeDir: configuration.happyHomeDir,
      preferVersion: effective.preferVersion,
      minisignPubkeyFile,
      channel: effective.channel,
    });
  });

  // Refresh cache best-effort.
  await runSelfUpdateStep(steps, '正在刷新更新缓存', async () => {
    await cmdCheck([
      'check',
      '--quiet',
      ...(effective.channel === 'preview'
        ? ['--preview']
        : effective.channel === 'publicdev'
          ? ['--dev']
          : []),
    ]);
  });
  const updatedToolName = resolveManagedCliToolNameForRing(effective.channel);
  console.log(chalk.green(`✓ 已将 ${updatedToolName} 更新到 ${result.updatedTo}`));
  const migrationRan = await maybeRunVersionGatedRuntimeMigration({
    fromVersion: result.previousVersionId,
    toVersion: result.updatedTo,
    hadLegacyCurrentInstallWithoutVersionMarkers: result.hadLegacyCurrentInstallWithoutVersionMarkers,
    argv: ['repair'],
    commandPath: `${updatedToolName} doctor`,
  });
  await maybeRunDoctorRepair({
    migrationRan,
  });
}

function resolveInternalInstallPayloadArgValue(argv: string[], flagName: string): string {
  const positionalIndex = argv.indexOf(flagName);
  if (positionalIndex >= 0) {
    return String(argv[positionalIndex + 1] ?? '').trim();
  }
  const equalsArg = argv.find((arg) => arg.startsWith(`${flagName}=`));
  return String(equalsArg?.slice(flagName.length + 1) ?? '').trim();
}

function parseFirstPartyComponentId(value: string): FirstPartyComponentId {
  if ((FIRST_PARTY_COMPONENT_IDS as readonly string[]).includes(value)) {
    return value as FirstPartyComponentId;
  }
  throw new Error(`未知的第一方组件：${value}`);
}

function shouldSkipInstallPayloadMigration(processEnv: NodeJS.ProcessEnv): boolean {
  return processEnv.HAPPIER_CLI_SKIP_INSTALL_PAYLOAD_MIGRATION === '1';
}

async function withInstalledCliMigrationRuntime<T>(params: Readonly<{
  channel: PublicReleaseRingId;
  run: () => Promise<T>;
}>): Promise<T> {
  const installedCliPaths = resolveInstalledFirstPartyComponentPaths({
    componentId: 'happier-cli',
    channel: params.channel,
    processEnv: process.env,
  });
  const scopedEnvUpdates = {
    HAPPIER_DAEMON_SERVICE_CHANNEL: params.channel,
    HAPPIER_PUBLIC_RELEASE_CHANNEL: getReleaseRingCatalogEntry(params.channel).publicLabel,
    HAPPIER_DAEMON_SERVICE_NODE_PATH: installedCliPaths.binaryPath,
    HAPPIER_DAEMON_SERVICE_ENTRY_PATH: '',
  } as const;
  const previousEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(scopedEnvUpdates)) {
    previousEnv.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return await params.run();
  } finally {
    for (const [key, previousValue] of previousEnv.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

async function cmdInternalInstallPayload(argv: string[], rawArgv: readonly string[] = process.argv): Promise<void> {
  const componentId = parseFirstPartyComponentId(resolveInternalInstallPayloadArgValue(argv, '--component'));
  const payloadRoot = resolveInternalInstallPayloadArgValue(argv, '--payload-root');
  const versionId = resolveInternalInstallPayloadArgValue(argv, '--version');
  const channel = normalizePublicReleaseRingId(resolveInternalInstallPayloadArgValue(argv, '--channel'))
    || resolveSelfReleaseChannel({ args: argv, rawArgv }).ringId;

  if (!payloadRoot) {
    throw new Error('--payload-root 为必填项');
  }
  if (!versionId) {
    throw new Error('--version 为必填项');
  }

  if (componentId === 'happier-cli') {
    await quiesceInstalledCliWindowsPayloadOwners({
      channel,
      processEnv: process.env,
    });
  }

  const promotion = await installVersionedPayload({
    componentId,
    channel,
    payloadRoot,
    payloadRootAlreadyFiltered: true,
    processEnv: process.env,
    versionId,
  });

  if (componentId === 'happier-cli' && !shouldSkipInstallPayloadMigration(process.env)) {
    await withInstalledCliMigrationRuntime({
      channel,
      run: async () => await maybeRunVersionGatedRuntimeMigration({
        fromVersion: promotion.previousVersionId,
        toVersion: promotion.currentVersionId,
        hadLegacyCurrentInstallWithoutVersionMarkers: promotion.hadLegacyCurrentInstallWithoutVersionMarkers,
        argv: ['repair'],
        commandPath: 'kaiwu doctor',
        // Install-payload promotion is spawned by installer scripts with no
        // controlling TTY — migration must run headlessly here.
        forceNonInteractive: true,
      }),
    });
    return;
  }
}

export async function handleSelfCliCommand(context: CommandContext): Promise<void> {
  try {
    const argv = context.args.slice(1);
    const sub = argv[0] ?? 'help';
    if (sub === 'help' || sub === '--help' || sub === '-h') {
      console.log(usage());
      return;
    }
    if (sub === 'check') {
      await cmdCheck(argv.slice(1), context.rawArgv);
      return;
    }
    if (sub === 'update') {
      await cmdUpdate(argv.slice(1), context.rawArgv);
      return;
    }
    if (sub === 'migrate') {
      await handleSelfMigrateCommand(argv.slice(1));
      return;
    }
    if (sub === '__install-payload') {
      await cmdInternalInstallPayload(argv.slice(1), context.rawArgv);
      return;
    }
    console.error(chalk.red('错误：'), `未知的 self 子命令：${sub}`);
    console.log(usage());
    process.exit(1);
  } catch (error) {
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
