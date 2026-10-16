import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import packageJson from '../../../package.json';
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
  readUpdateCache,
  writeUpdateCache,
} from '@happier-dev/cli-common/update';
import {
  getReleaseRingCatalogEntry,
  getReleaseRingPublicLabel,
  normalizePublicReleaseRingId,
  type PublicReleaseRingId,
} from '@happier-dev/release-runtime/releaseRings';
import { handleSelfMigrateCommand } from './self/handleSelfMigrateCommand';
import { fetchKaiwuLatestCliVersion, resolveKaiwuInstallCommand } from './self/kaiwuReleaseSource';
import { maybeRunVersionGatedRuntimeMigration } from './self/maybeRunVersionGatedRuntimeMigration';
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
    `${chalk.bold('发布源:')}`,
    `  开物发布清单（kaiwu.wujilabs.cn），只提供正式通道；更新即运行官方安装脚本`,
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

function resolvePublicReleaseRingSuffix(ring: SelfChannel): 'stable' | 'preview' | 'dev' {
  return getReleaseRingPublicLabel(ring);
}

function updateCachePath(channel: SelfChannel): string {
  const suffix = resolvePublicReleaseRingSuffix(channel);
  const fileName = suffix === 'stable' ? 'update.json' : `update.${suffix}.json`;
  return join(configuration.happyHomeDir, 'cache', fileName);
}

async function cmdCheck(argv: string[], rawArgv: readonly string[] = process.argv): Promise<void> {
  const channelResolution = resolveSelfReleaseChannel({ args: argv, rawArgv });
  const channel = channelResolution.ringId;
  const quiet = argv.includes('--quiet');

  // Kaiwu releases are published only to our own release manifest; never consult npm or GitHub,
  // where the same package names belong to the upstream project.
  const latest = await fetchKaiwuLatestCliVersion();
  const invokerVersion = configuration.currentCliVersion;
  const current = invokerVersion || null;
  const updateAvailable = Boolean(current && latest && compareVersions(latest, current) > 0);

  const existing = readUpdateCache(updateCachePath(channel));
  writeUpdateCache(updateCachePath(channel), {
    checkedAt: Date.now(),
    latest,
    current,
    runtimeVersion: null,
    invokerVersion,
    updateAvailable,
    notifiedAt: existing?.notifiedAt ?? null,
  });

  if (quiet) return;

  if (!latest) {
    console.log(chalk.gray('无法确定最新版本（开物发布清单暂不可达）。'));
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
  resolveSelfReleaseChannel({ args: argv, rawArgv });
  if (argv.some((a) => a === '--to' || a.startsWith('--to='))) {
    console.log(chalk.yellow('开物只提供正式通道最新版，已忽略 --to。'));
  }

  const command = resolveKaiwuInstallCommand(process.platform);
  if (process.platform === 'win32') {
    // The running kaiwu.exe is locked on Windows; the installer must run outside this process.
    console.log(`Windows 上的开物 CLI 通过安装脚本更新：${command}`);
    return;
  }

  console.log(chalk.gray('正在运行开物安装脚本：'), chalk.cyan(command));
  const result = spawnSync('bash', ['-c', command], { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    console.error(chalk.red(`更新失败（退出码 ${result.status ?? 'unknown'}）。可手动运行：${command}`));
    process.exit(result.status || 1);
  }
  await cmdCheck(['check', '--quiet']);
  console.log(chalk.green('✓ 开物 CLI 已更新到最新版本'));
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
