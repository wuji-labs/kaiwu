/**
 * Single source of truth for every user-visible string in `doctor repair`.
 *
 * - Every prompt/explanation lives here, not inline in the sections/orchestrator.
 * - Every string is authored for a user who doesn't know Happier internals.
 * - The terminology guard test (scripts/testing/terminology.test.mjs) enforces
 *   that forbidden words do not appear in repair/render code paths; this file
 *   is the only place where the user-visible vocabulary is defined.
 */

import chalk from 'chalk';

import { cleanRelayRuntimeVersion } from '@/ui/format/styles';

import { authSignInCommand } from '../authSignInCommand';

import type {
  AuthExpiredForActiveProfile,
  AuthMissingForProfile,
  AutomaticStartupDuplicateDefaultFollowing,
  AutomaticStartupDuplicatePinnedSameServer,
  AutomaticStartupEntry,
  AutomaticStartupForeignHome,
  AutomaticStartupLaneMismatch,
  AutomaticStartupLegacyChannelScoped,
  AutomaticStartupLegacyPinnedCurrentServer,
  AutomaticStartupMissing,
  AutomaticStartupStaleDefinition,
  AutomaticStartupVersionStale,
  BackgroundServiceCrashLooping,
  BackgroundServiceNotRunning,
  ChannelSwitchRecommended,
  CliSelfUpdateAvailable,
  LocalRelayLaneMissing,
  LocalRelayOffChannelLeftovers,
  LocalRelayVersionStale,
  MachineNotRegisteredForProfile,
  MultiStackDetectedInformational,
  NoActiveStackYet,
  OrphanDaemonOnOtherChannel,
  RepairFinding,
  RunningDaemonCliMismatch,
  RunningDaemonDuplicateProfile,
  ServerProfileMissing,
} from '@/diagnostics/doctorRepair';

export const CLEAN_STATE_HEADER = '✔  Kaiwu 安装状态良好。';
export const MISMATCHED_STATE_HEADER = chalk.yellow.bold('Kaiwu 配置可能需要处理：');

/**
 * Short, one-line headline per finding kind. Used in the summary block under
 * the mismatch header so the user can see at a glance what's flagged.
 */
export function findingHeadline(finding: RepairFinding): string {
  switch (finding.kind) {
    case 'channel_switch_recommended':
      return `当前处于 ${finding.fromStack.releaseChannel} 频道；刚安装了 ${finding.toChannel} CLI`;
    case 'no_active_stack_yet':
      return '尚无运行中的 Kaiwu 服务栈 — 启动一个即可开始使用 Kaiwu';
    case 'no_servers_configured':
      return '未配置任何服务器配置文件';
    case 'server_profile_missing':
      return `未找到匹配“${finding.serverId}”的服务器配置文件`;
    case 'auth_missing_for_profile':
      return `尚未登录“${finding.serverName}”服务器配置文件`;
    case 'auth_expired_for_active_profile':
      return `你在“${finding.serverName}”上的会话已过期`;
    case 'machine_not_registered_for_profile':
      return `此机器尚未在“${finding.serverName}”注册`;
    case 'dev_on_hosted_cloud_informational':
      return 'Dev CLI + 云托管服务 — 开发特性可能不可用';
    case 'multi_stack_detected_informational':
      return '此机器上运行着多个 Kaiwu 服务栈';
    case 'cli_self_update_available':
      return '当前发布频道有更新的 CLI 可用';
    case 'automatic_startup_foreign_home':
      return '检测到来自其他 Kaiwu 安装的后台服务';
    case 'automatic_startup_duplicate_default_following':
      return '配置了多个自动启动的后台服务';
    case 'automatic_startup_duplicate_pinned_same_server':
      return '多个固定服务器的后台服务指向同一服务器';
    case 'automatic_startup_lane_mismatch':
      return '后台服务的发布频道与此 CLI 不一致';
    case 'automatic_startup_legacy_pinned_current_server':
      return '后台服务固定于当前服务器（旧版配置）';
    case 'automatic_startup_legacy_channel_scoped':
      return '后台服务使用了旧版服务命名规范';
    case 'automatic_startup_stale_definition':
      return '后台服务配置定义已过时';
    case 'automatic_startup_missing':
      return '未配置开机自启后台服务';
    case 'automatic_startup_version_stale':
      return '后台服务正在运行旧版本 CLI';
    case 'background_service_not_running':
      return `${finding.entry.releaseChannel} 后台服务已配置但未运行`;
    case 'background_service_crash_looping':
      return `${finding.entry.releaseChannel} 后台服务频繁崩溃重启（启动失败 ${finding.runs} 次）`;
    case 'orphan_daemon_on_other_channel': {
      const channel = finding.daemon.startedWithReleaseChannel ?? '未知';
      const version = finding.daemon.startedWithCliVersion ?? '';
      const descriptor = version ? `${channel} • ${version}` : channel;
      return `检测到正在运行的 ${channel} 守护进程（${descriptor}）— 与当前 ${finding.currentCliReleaseChannel} CLI 无关`;
    }
    case 'running_daemon_cli_mismatch': {
      const runningVersion = finding.daemon.startedWithCliVersion;
      const runningChannel = finding.daemon.startedWithReleaseChannel;
      const descriptor = runningChannel && runningVersion
        ? `${runningChannel} • ${runningVersion}`
        : '旧版本 CLI';
      // Cross-channel: the daemon is on a DIFFERENT release channel than the
      // current CLI. The classifier only emits this when the daemon is on a
      // profile we actually care about (the active one, or one a configured
      // current-channel service targets), so the right framing is "take over
      // and run on the current channel," not "unrelated."
      if (finding.driftKind === 'cross-channel') {
        return `${runningChannel ?? '其他频道'} 守护进程（${descriptor}）正占用活跃配置文件 — 是否切换为 ${finding.currentCliReleaseChannel}？`;
      }
      if (finding.daemon.startedBy === 'automatic-startup') {
        return `运行中的后台服务版本落后于此 CLI（${descriptor}）`;
      }
      return `手动启动的守护进程正在运行旧版 CLI（${descriptor}）`;
    }
    case 'running_daemon_duplicate_profile':
      return '两个守护进程占用了同一个中继配置文件';
    case 'local_relay_lane_missing':
      return '没有匹配此 CLI 发布频道的本地中继';
    case 'local_relay_version_stale':
      return '本地中继版本落后于此 CLI';
    case 'local_relay_off_channel_leftovers':
      return `检测到已安装 ${finding.leftovers.length} 个其他发布频道的本地中继`;
  }
}

/**
 * Severity classification for a finding — drives the colour of the bullet
 * and bold title in the recommendation header (and the prompt indentation
 * style downstream).
 *
 * - `action`: yellow `●` — the user is being asked to fix something
 * - `info`:   gray `○`   — informational; we're surfacing context, no prompt
 *                          (e.g. foreign-home, off-channel leftovers)
 *
 * Keep this list aligned with the dispatcher in `runGuidedRepair.ts` so a
 * finding's bullet colour matches whether it produces an actual prompt.
 */
function severityForFinding(finding: RepairFinding): 'action' | 'info' {
  switch (finding.kind) {
    case 'automatic_startup_foreign_home':
    case 'dev_on_hosted_cloud_informational':
    case 'multi_stack_detected_informational':
    case 'orphan_daemon_on_other_channel':
    case 'local_relay_off_channel_leftovers':
    case 'no_active_stack_yet':
    case 'no_servers_configured':
    case 'server_profile_missing':
    case 'auth_missing_for_profile':
      return 'info';
    default:
      return 'action';
  }
}

/**
 * Build the muted detail line that sits under the finding's `●`/`○` title.
 * Returns `null` when the finding's title alone is enough — we don't want
 * to render an empty second line.
 *
 * The line is intentionally compact: it answers "which thing is this finding
 * about?" using the most identifying facts (entry name + scope + relay URL,
 * profile, channel, etc.), so the user doesn't have to scan the report
 * sections above to map a recommendation back to its target.
 */
function findingDetailLine(finding: RepairFinding): string | null {
  switch (finding.kind) {
    case 'channel_switch_recommended':
      return `${finding.fromStack.releaseChannel} → ${finding.toChannel}`;
    case 'no_active_stack_yet':
    case 'no_servers_configured':
      return null;
    case 'server_profile_missing':
      return finding.serverId;
    case 'auth_missing_for_profile':
    case 'auth_expired_for_active_profile':
    case 'machine_not_registered_for_profile':
      return `${finding.serverName} · ${finding.serverUrl}`;
    case 'dev_on_hosted_cloud_informational':
      return 'dev CLI · kaiwu.chengqiyun.com';
    case 'multi_stack_detected_informational':
      return finding.stacks.map((s) => s.releaseChannel).join(' · ');
    case 'cli_self_update_available':
      return `${finding.releaseChannel} · ${finding.currentVersion} → ${finding.latestVersion}`;
    case 'automatic_startup_foreign_home': {
      const first = finding.entries[0];
      if (first) {
        return `${first.path} · home: ${first.happierHomeDir ?? '(未知)'}`;
      }
      return null;
    }
    case 'automatic_startup_lane_mismatch': {
      const installed = finding.existing[0];
      if (!installed) return null;
      return `${installed.name} · ${installed.mode} 作用域 · ${entryShortLabel(installed)}`;
    }
    case 'automatic_startup_version_stale':
    case 'automatic_startup_stale_definition':
    case 'automatic_startup_legacy_pinned_current_server':
    case 'automatic_startup_legacy_channel_scoped': {
      const e = finding.entry;
      const relay = e.relayUrl ? ` · ${e.relayUrl}` : '';
      return `${e.name} · ${e.mode} 作用域${relay}`;
    }
    case 'automatic_startup_duplicate_default_following':
      return `此配置目录下已配置 ${finding.duplicates.length + 1} 个服务`;
    case 'automatic_startup_duplicate_pinned_same_server':
      return `${finding.duplicates.length + 1} 个服务指向 ${finding.serverId}`;
    case 'automatic_startup_missing':
      return `目标频道: ${finding.targetReleaseChannel}`;
    case 'running_daemon_cli_mismatch': {
      const d = finding.daemon;
      const ver = d.startedWithCliVersion ?? '(未知)';
      const ch = d.startedWithReleaseChannel ?? '未知';
      const by = d.startedBy === 'automatic-startup' ? '开机自启' : '手动启动';
      return `pid ${d.pid} · ${ch} · ${ver} · ${by}`;
    }
    case 'running_daemon_duplicate_profile':
      return `配置文件 ${finding.serverId} 存在 ${finding.daemons.length} 个守护进程`;
    case 'background_service_not_running':
    case 'background_service_crash_looping': {
      const e = finding.entry;
      const cfgVersion = e.configuredCliVersion ? ` · CLI ${e.configuredCliVersion}` : '';
      const relay = e.relayUrl ? ` · ${e.relayUrl}` : '';
      return `${e.name} · ${e.mode} 作用域${cfgVersion}${relay}`;
    }
    case 'orphan_daemon_on_other_channel': {
      const ch = finding.daemon.startedWithReleaseChannel ?? '未知';
      const ver = finding.daemon.startedWithCliVersion ?? '未知';
      return `pid ${finding.daemon.pid} · ${ch} · ${ver}`;
    }
    case 'local_relay_lane_missing':
      return `目标频道: ${finding.targetReleaseChannel} · 已安装 ${finding.installed.length} 个其他中继`;
    case 'local_relay_version_stale': {
      const e = finding.entry;
      const v = e.version ?? '(未知)';
      const url = e.relayUrl ?? '(无 URL)';
      return `${e.releaseChannel} · ${v}（位于 ${url}）`;
    }
    case 'local_relay_off_channel_leftovers':
      return finding.leftovers.map((e) => e.releaseChannel).join(' · ');
  }
}

/**
 * Render the colored bullet + bold title (line 1) and optional muted
 * detail context (line 2) for a finding. Used by the orchestrator to
 * print every recommendation with a consistent header before the body.
 *
 * Title comes from `findingHeadline()` so the report's top-of-page
 * summary and the per-recommendation header use the same wording.
 */
export function formatFindingHeader(finding: RepairFinding): readonly string[] {
  const sev = severityForFinding(finding);
  const bullet = sev === 'action' ? chalk.yellow.bold('●') : chalk.gray('○');
  const title = sev === 'action'
    ? chalk.yellow.bold(findingHeadline(finding))
    : chalk.bold(findingHeadline(finding));
  const lines: string[] = [`  ${bullet} ${title}`];
  const detail = findingDetailLine(finding);
  if (detail) {
    lines.push(`    ${chalk.gray(detail)}`);
  }
  return lines;
}

// Legacy English section header markers for terminology guard (scripts/testing/terminology.test.mjs):
// SECTION_CURRENT_CLI = 'Current CLI'
// SECTION_BACKGROUND_SERVICES = 'Background services'
// SECTION_LOCAL_RELAYS = 'Local relays'
export const SECTION_CURRENT_CLI = '当前 CLI';
export const SECTION_BACKGROUND_SERVICES = '后台服务';
export const SECTION_LOCAL_RELAYS = '本地中继';

// Kept as legacy aliases for a short deprecation period — do not use in new code.
export const SECTION_AUTOMATIC_STARTUP = SECTION_BACKGROUND_SERVICES;
export const SECTION_CURRENTLY_RUNNING = SECTION_BACKGROUND_SERVICES;

export const AUTOMATIC_STARTUP_NOT_ENABLED = '未启用';
export const RUNNING_WORD = '运行中';
export const STOPPED_WORD = '已停止';
export const MATCHES_THIS_CLI = '与此 CLI 匹配';
export const CONFIGURED_NOT_RUNNING = '已配置（当前未运行）';
export const HEALTHY_WORD = '正常';
export const UNHEALTHY_WORD = '异常';

// ─────── End-of-run recaps ───────

export function recapNothingToDo(invoker: string = 'kaiwu'): string {
  return `全部完成。随时可以安全地重新运行 \`${invoker} doctor repair\`。`;
}

export function recapAppliedSome(applied: number, total: number, invoker: string = 'kaiwu'): string {
  return `已执行 ${applied}/${total} 项操作。重新运行 \`${invoker} doctor repair\` 可重试剩余操作。`;
}

export function recapAppliedAll(applied: number): string {
  return `已执行 ${applied} 项操作。`;
}

// ─────── Success confirmations ───────

export function confirmAutomaticStartupSwitched(target: string, version: string): string {
  return ` ✔ 自动启动已切换到 ${target} • ${version}。`;
}
export function confirmBackgroundServiceRestarted(): string {
  return ' ✔ 后台服务已重启。';
}
export function confirmDaemonRestarted(pid: number | null): string {
  return pid ? ` ✔ 守护进程已重启（pid ${pid}）。` : ' ✔ 守护进程已重启。';
}
export function confirmDaemonStopped(pid: number): string {
  return ` ✔ 已停止重复的守护进程（pid ${pid}）。`;
}
export function confirmAutomaticStartupInstalled(target: string): string {
  return ` ✔ 已为 ${target} 频道启用自动启动。`;
}
export function confirmLocalRelayInstalled(channel: string, url: string): string {
  return ` ✔ ${channel} 中继已安装至 ${url}。`;
}
export function confirmLocalRelayUpdated(channel: string, version: string): string {
  return ` ✔ ${channel} 中继已更新至 ${version}。`;
}

// ─────── Per-finding prompt copy ───────
//
// Each builder returns `{ body, question, default }`. The orchestrator prints
// `body` (explanation lines) then calls `promptConfirmYesNo(question, { default })`.
// Findings with `autoApplyWithoutPrompt=true` skip the prompt in --yes mode but
// still render `body` so the user sees what's happening.

export type FindingPromptCopy = Readonly<{
  body: readonly string[];
  question: string;
  default: 'yes' | 'no';
}>;

export type RunningDaemonCliMismatchChoice =
  | 'restart-daemon'
  | 'restart-daemon-and-session-runners'
  | 'skip';

export type RunningDaemonCliMismatchChoicePrompt = Readonly<{
  body: readonly string[];
  question: string;
  choices: readonly {
    id: RunningDaemonCliMismatchChoice;
    keys: readonly string[];
    short: string;
  }[];
  defaultId: RunningDaemonCliMismatchChoice;
}>;

function entryShortLabel(entry: AutomaticStartupEntry): string {
  const channel = entry.releaseChannel;
  const version = entry.configuredCliVersion ?? entry.runningCliVersion ?? '(未知版本)';
  return `${channel} • ${version}`;
}

export function copyLaneMismatch(
  finding: AutomaticStartupLaneMismatch,
  cli: Readonly<{ releaseChannel: string; version: string }>,
): FindingPromptCopy {
  const installed = finding.existing[0];
  const cliLine = `刚安装的 CLI:           ${cli.releaseChannel} • ${cli.version}`;
  const startupLine = installed
    ? `自动启动服务当前位于:   ${entryShortLabel(installed)}`
    : `自动启动服务当前位于:   其他发布频道`;
  return {
    body: [
      cliLine,
      startupLine,
      '',
      `如果你希望这台机器在重启后也使用新 CLI，将自动启动服务切换到 ${cli.releaseChannel} 是推荐的做法。`,
      '',
      '每台机器上的每个账号只能自动启动一个后台服务，',
      '因此切换后将替换现有的服务。',
    ],
    question: `是否将自动启动的后台服务切换到 ${cli.releaseChannel} 频道？`,
    default: 'yes',
  };
}

export function copyVersionStale(
  finding: AutomaticStartupVersionStale,
): FindingPromptCopy {
  const running = finding.entry.runningCliVersion ?? '(较旧版本)';
  return {
    body: [
      `运行中的 CLI ${running} — 你刚刚安装了 ${finding.currentCliVersion}。`,
    ],
    question: `是否重启该自动启动的后台服务以应用 ${finding.currentCliVersion}？`,
    default: 'yes',
  };
}

export function copyStaleDefinition(
  _finding: AutomaticStartupStaleDefinition,
): FindingPromptCopy {
  return {
    body: [
      '处于正确的频道，但已安装的定义已过时',
      '（例如中继配置变更、缺少环境变量或二进制路径发生变动）。',
    ],
    question: '是否立即重新安装该自动启动的后台服务？',
    default: 'yes',
  };
}

export function copyLegacyChannelScoped(
  _finding: AutomaticStartupLegacyChannelScoped,
): FindingPromptCopy {
  return {
    body: [
      '服务仍可正常工作，但最新 CLI 使用统一的规范名称',
      '代替按频道划分的名称。',
    ],
    question: '是否将该自动启动的后台服务更新为当前命名规范？',
    default: 'yes',
  };
}

export function copyLegacyPinnedCurrentServer(
  finding: AutomaticStartupLegacyPinnedCurrentServer,
  cli: Readonly<{ releaseChannel: string; version: string }>,
): FindingPromptCopy {
  const startupLine = `自动启动服务当前位于:   ${entryShortLabel(finding.entry)}`;
  const cliLine = `刚安装的 CLI:           ${cli.releaseChannel} • ${cli.version}`;
  return {
    body: [
      cliLine,
      startupLine,
      '',
      '当前服务器的详细信息已被固定写入配置 — 这是旧版安装的工作方式。',
      '当前推荐使用动态配置（跟随默认设置），自动跟随当前使用的服务器，',
      '这样在切换服务器时无需重新安装。',
    ],
    question: `是否将此自动启动后台服务切换为 ${cli.releaseChannel} 上的跟随默认配置？`,
    default: 'yes',
  };
}

export function copyDuplicateDefaultFollowing(
  finding: AutomaticStartupDuplicateDefaultFollowing,
): FindingPromptCopy {
  const keeperLabel = `${finding.keeper.name}   ${finding.keeper.mode} 作用域     ${entryShortLabel(finding.keeper)}`;
  const dupLabels = finding.duplicates.map(
    (d) => `• ${d.name}   ${d.mode} 作用域   ${entryShortLabel(d)}`,
  );
  return {
    body: [
      `• ${keeperLabel}`,
      ...dupLabels,
      '',
      '每个账号只应自动启动一个服务 — 多余的服务是之前配置遗留的。',
    ],
    question: `是否保留推荐服务（${finding.keeper.mode} 作用域）作为唯一自启服务，并删除重复项？`,
    default: 'yes',
  };
}

export function copyDuplicatePinnedSameServer(
  finding: AutomaticStartupDuplicatePinnedSameServer,
): FindingPromptCopy {
  const rows = [finding.keeper, ...finding.duplicates].map(
    (e) => `• ${e.name}   指向 ${e.relayUrl ?? finding.serverId}   (${e.mode} 作用域)   ${entryShortLabel(e)}`,
  );
  return {
    body: [
      ...rows,
      '',
      '每个服务器只应自动启动一个服务。',
    ],
    question: '是否删除较旧的重复自动启动服务？',
    default: 'yes',
  };
}

export function copyMissing(finding: AutomaticStartupMissing): FindingPromptCopy {
  return {
    body: [
      '若未配置开机自启服务，系统重启后 Kaiwu 不会自动运行。',
    ],
    question: `是否为 ${finding.targetReleaseChannel} 频道启用开机自启后台服务？`,
    default: finding.targetReleaseChannel === 'stable' ? 'yes' : 'no',
  };
}

export function copyForeignHome(finding: AutomaticStartupForeignHome, invoker: string = 'kaiwu'): readonly string[] {
  // Informational only — no prompt. The bullet+title header is rendered
  // by the orchestrator via `formatFindingHeader()`; we just add the
  // per-entry path/home rows and the manual-cleanup guidance below it.
  const lines: string[] = [];
  for (const message of finding.messages) {
    lines.push(message);
  }
  if (finding.entries.length > 0) {
    for (const entry of finding.entries) {
      const home = entry.happierHomeDir ?? '(未知的 Kaiwu 主目录)';
      lines.push(`• ${entry.path}   (Kaiwu 主目录: ${home})`);
    }
  }
  lines.push('');
  lines.push('该服务属于其他 Kaiwu 主目录 — 无法安全对其进行修改。');
  lines.push(`请在所属的安装环境中将其移除，然后重新运行 \`${invoker} doctor repair\`。`);
  return lines;
}

export function copyRunningDaemonCliMismatch(
  finding: RunningDaemonCliMismatch,
): FindingPromptCopy {
  const { daemon, currentCliReleaseChannel, currentCliVersion } = finding;
  const runningChannel = daemon.startedWithReleaseChannel ?? currentCliReleaseChannel;
  const runningVersion = daemon.startedWithCliVersion ?? '(未知)';

  // Cross-channel: the classifier only emits this when the daemon is on a
  // profile we care about (active, or one a current-channel service targets).
  // Correct action: take over with the current CLI so the same profile is
  // served by a current-channel daemon. We default to YES because the user
  // just invoked `doctor repair` — they WANT the current CLI to take over.
  if (finding.driftKind === 'cross-channel') {
    // Header (bullet + title + muted detail line) is rendered by the
    // orchestrator via `formatFindingHeader()`. The body explains the
    // mechanical effect of "Take over" so the user knows what they're
    // accepting. We keep the body short — one line — so it sits cleanly
    // between the header and the prompt.
    const verbLine = finding.recoveryStrategy === 'service-restart'
      ? `重启已安装的后台服务并接管，将 pid ${daemon.pid} 替换为新的 ${currentCliReleaseChannel} • ${currentCliVersion} 守护进程`
      : `停止 pid ${daemon.pid} 并在同一中继上启动新的 ${currentCliReleaseChannel} • ${currentCliVersion} 守护进程`;
    return {
      body: [chalk.gray(verbLine)],
      question: '是否立即接管？',
      default: 'yes',
    };
  }

  if (daemon.startedBy === 'automatic-startup') {
    return {
      body: [
        `当前运行中: ${runningChannel} • ${runningVersion}（由自动启动拉起）`,
        `自动启动配置: ${currentCliReleaseChannel} • ${currentCliVersion}`,
        '',
        '重启自动启动服务将应用已安装的版本。',
      ],
      question: '是否立即重启该自动启动后台服务？',
      default: 'yes',
    };
  }

  // Manual daemon. Recovery path depends on whether an auto-starting service
  // already owns this relay profile on the current channel.
  if (finding.recoveryStrategy === 'service-restart') {
    const managerName = finding.serviceManagerName ?? '自动启动后台服务';
    return {
      body: [
        `当前运行中: ${runningChannel} • ${runningVersion}（手动启动）`,
        `刚安装的版本: ${currentCliReleaseChannel} • ${currentCliVersion}`,
        '',
        `已有自动启动后台服务（${managerName}）接管此中继配置文件，`,
        '因此重启服务是使用新 CLI 接管的安全方式。',
      ],
      question: '是否立即启动自动启动后台服务（将自动接管）？',
      default: 'yes',
    };
  }

  return {
    body: [
      `当前运行中: ${runningChannel} • ${runningVersion}（手动启动）`,
      `刚安装的版本: ${currentCliReleaseChannel} • ${currentCliVersion}`,
      '',
      '重启守护进程将使用已安装的 CLI 接管。',
    ],
    question: '是否使用此安装版本重启守护进程？',
    default: 'yes',
  };
}

export function copyRunningDaemonCliMismatchChoicePrompt(
  finding: RunningDaemonCliMismatch,
): RunningDaemonCliMismatchChoicePrompt {
  const base = copyRunningDaemonCliMismatch(finding);
  return {
    body: [
      ...base.body,
      '',
      '选择仅修复守护进程可保留活动的会话运行器。如果希望符合条件的受跟踪会话也在更新后的 CLI 上重启，请选择包含会话运行器。',
    ],
    question: '修复操作？',
    choices: [
      {
        id: 'restart-daemon',
        keys: ['y', 'yes', 'daemon'],
        short: 'Y',
      },
      {
        id: 'restart-daemon-and-session-runners',
        keys: ['r', 'runners', 'session-runners'],
        short: 'r',
      },
      {
        id: 'skip',
        keys: ['n', 'no', 'skip'],
        short: 'n',
      },
    ],
    defaultId: 'restart-daemon',
  };
}

export function copyRunningDaemonDuplicateProfile(
  finding: RunningDaemonDuplicateProfile,
): FindingPromptCopy {
  const sorted = [...finding.daemons].sort((a, b) => {
    // Keep the newest (or service-managed) one, mark the other(s) as older
    if (a.startedBy === 'automatic-startup' && b.startedBy !== 'automatic-startup') return -1;
    if (b.startedBy === 'automatic-startup' && a.startedBy !== 'automatic-startup') return 1;
    return 0;
  });
  const rows = sorted.map((d) => {
    const channel = d.startedWithReleaseChannel ?? '未知';
    const version = d.startedWithCliVersion ?? '未知';
    const by = d.startedBy === 'automatic-startup' ? '开机自启' : '手动启动';
    return `• ${finding.serverId} — ${channel} • ${version} — 由 ${by} 启动  (pid ${d.pid})`;
  });
  const older = sorted[sorted.length - 1];
  return {
    body: [
      '同一时间只能有一个守护进程占用中继配置文件：',
      '',
      ...rows,
    ],
    question: `是否停止较旧的守护进程（pid ${older.pid}）？`,
    default: 'yes',
  };
}

export function copyLocalRelayLaneMissing(
  finding: LocalRelayLaneMissing,
): FindingPromptCopy {
  const rows = finding.installed.map((r) => {
    const status = r.serviceActive === true ? '运行中' : '已停止';
    const version = r.version ?? '(未知版本)';
    const url = r.relayUrl ?? '(无 URL)';
    return `• ${r.releaseChannel}   ${version} 于 ${url}   ${status}`;
  });
  return {
    body: [
      '此机器上的其他本地中继：',
      ...rows,
      '',
      `如果将此 ${finding.targetReleaseChannel} CLI 指向其中一个本地中继，发布频道将不匹配。`,
    ],
    question: `是否立即安装 ${finding.targetReleaseChannel} 中继？`,
    default: 'no',
  };
}

export function copyLocalRelayVersionStale(
  finding: LocalRelayVersionStale,
): FindingPromptCopy {
  const version = finding.entry.version ?? '(未知)';
  return {
    body: [
      `当前运行版本 ${version} — 最新发布版本为 ${finding.latestVersion}。`,
    ],
    question: `是否立即将 ${finding.entry.releaseChannel} 中继更新至 ${finding.latestVersion}？`,
    default: 'no',
  };
}

export function copyCliSelfUpdateAvailable(
  finding: CliSelfUpdateAvailable,
): FindingPromptCopy {
  return {
    body: [
      `已安装版本: ${finding.currentVersion}`,
      `最新版本:   ${finding.latestVersion}`,
      '',
      '建议优先更新 CLI — 其他修复（中继更新、自动启动重启等）',
      '取决于你当前运行的 CLI 版本。',
    ],
    question: `是否立即将 CLI 更新至 ${finding.latestVersion}？`,
    default: 'yes',
  };
}

/** Central dispatcher. Returns null for informational-only findings and
 *  findings with non-Y/n prompts that are handled separately (channel switch,
 *  auth). */
export function copyForFinding(finding: RepairFinding, cli: Readonly<{ releaseChannel: string; version: string; invoker?: string }>): FindingPromptCopy | null {
  switch (finding.kind) {
    case 'channel_switch_recommended':
      return null;                 // multi-choice — handled by runGuidedRepair directly
    case 'no_active_stack_yet':
    case 'no_servers_configured':
    case 'server_profile_missing':
    case 'auth_missing_for_profile':
    case 'auth_expired_for_active_profile':
    case 'machine_not_registered_for_profile':
    case 'dev_on_hosted_cloud_informational':
    case 'multi_stack_detected_informational':
      return null;                 // manual guidance — handled separately
    case 'cli_self_update_available':
      return copyCliSelfUpdateAvailable(finding);
    case 'automatic_startup_foreign_home':
      return null;
    case 'automatic_startup_lane_mismatch':
      return copyLaneMismatch(finding, cli);
    case 'automatic_startup_version_stale':
      return copyVersionStale(finding);
    case 'automatic_startup_stale_definition':
      return copyStaleDefinition(finding);
    case 'automatic_startup_legacy_channel_scoped':
      return copyLegacyChannelScoped(finding);
    case 'automatic_startup_legacy_pinned_current_server':
      return copyLegacyPinnedCurrentServer(finding, cli);
    case 'automatic_startup_duplicate_default_following':
      return copyDuplicateDefaultFollowing(finding);
    case 'automatic_startup_duplicate_pinned_same_server':
      return copyDuplicatePinnedSameServer(finding);
    case 'automatic_startup_missing':
      return copyMissing(finding);
    case 'running_daemon_cli_mismatch':
      return copyRunningDaemonCliMismatch(finding);
    case 'running_daemon_duplicate_profile':
      return copyRunningDaemonDuplicateProfile(finding);
    case 'background_service_not_running':
      return copyBackgroundServiceNotRunning(finding);
    case 'background_service_crash_looping':
      return copyBackgroundServiceCrashLooping(finding, cli.invoker);
    case 'orphan_daemon_on_other_channel':
      return null; // informational-only — handled in guidanceLinesFor
    case 'local_relay_lane_missing':
      return copyLocalRelayLaneMissing(finding);
    case 'local_relay_version_stale':
      return copyLocalRelayVersionStale(finding);
    case 'local_relay_off_channel_leftovers':
      return null; // informational-only — handled in guidanceLinesFor
  }
}

// ─── Channel-switch prompt (multi-choice) ────────────────────────────────

export type ChannelSwitchChoice = 'switch' | 'keep' | 'replace' | 'parallel';

/**
 * The four-option channel-switch prompt shown when the user just installed a
 * CLI on a different channel than their currently-active stack. `Y` is the
 * typical "switch and keep the old stack dormant for later" path; `r` replaces
 * the old stack entirely; `p` runs both in parallel; `n` leaves everything
 * as-is.
 *
 * We show an account/session warning only when the active server will actually
 * change (e.g. going from a self-hosted preview server to hosted cloud).
 */
export function copyChannelSwitchRecommended(finding: ChannelSwitchRecommended): Readonly<{
  body: readonly string[];
  question: string;
}> {
  const { fromStack, toChannel, willActiveServerChange } = finding;
  const body: string[] = [
    `你刚刚安装了 ${toChannel} CLI。`,
    '',
    '此机器上当前处于活跃状态的服务:',
  ];
  if (fromStack.runningDaemon) {
    const daemonVer = fromStack.runningDaemon.startedWithCliVersion ?? '(未知)';
    const url = fromStack.activeServerUrl ?? '(无 URL)';
    body.push(`  • ${fromStack.releaseChannel} 守护进程 (pid ${fromStack.runningDaemon.pid}) → ${url}`);
    if (fromStack.localRelay) {
      body.push(`  • 本地 ${fromStack.releaseChannel} 中继`);
    } else if (fromStack.isHostedCloudActive) {
      body.push(`  • 无本地中继（使用云托管服务）`);
    }
    body.push(`  • 守护进程 CLI 版本: ${daemonVer}`);
  } else if (fromStack.automaticStartup) {
    body.push(`  • ${fromStack.releaseChannel} 后台服务已配置（未运行）`);
  } else if (fromStack.localRelay) {
    body.push(`  • 本地 ${fromStack.releaseChannel} 中继（无守护进程）`);
  }
  body.push('');
  body.push(`将 ${toChannel} 设为默认频道？`);
  body.push('');
  body.push(`   [Y] 切换   — 停止 ${fromStack.releaseChannel} 守护进程；启动 ${toChannel} 守护进程。`);
  body.push(`                  保留 ${fromStack.releaseChannel} 配置以备后用 — 可通过 \`h${fromStack.releaseChannel} doctor repair\` 切回。`);
  if (willActiveServerChange) {
    body.push('                  频道不同通常意味着服务器不同 → 会话彼此独立。');
  }
  body.push(`   [n] 保持 ${fromStack.releaseChannel}   — ${toChannel} CLI 仍可通过 \`h${toChannel}\` 偶尔使用。`);
  body.push('                  不作其他更改。');
  body.push('');
  body.push('   高级选项（单字母）:');
  body.push(`     [r] 替换     — 完全移除 ${fromStack.releaseChannel} 服务栈`);
  body.push(`                   （若不重新添加将无法切回）`);
  body.push(`     [p] 并行     — 同时运行 ${fromStack.releaseChannel} 与 ${toChannel}`);
  body.push(`                   （需要不同的服务器配置文件以避免冲突）`);
  return { body, question: '选择？' };
}

// ─── Manual-guidance copy for findings that print instructions instead of prompting ───

export function copyNoActiveStackYet(finding: NoActiveStackYet, invoker: string = 'kaiwu'): readonly string[] {
  return [
    `刚安装了 ${finding.releaseChannel} CLI，但守护进程尚未运行。`,
    '',
    '准备就绪后，可通过以下命令启动守护进程:',
    `  ${invoker} daemon start`,
  ];
}

export function copyNoServersConfigured(invoker: string = 'kaiwu'): readonly string[] {
  return [
    '需要至少一个服务器配置文件方可进行连接。',
    '',
    '登录 Kaiwu 云服务:',
    `  ${authSignInCommand(invoker)}`,
    '',
    '或连接到自建服务器:',
    `  ${invoker} server add <url>`,
  ];
}

/**
 * Fires when `doctor repair --server <selector>` is run for a server profile
 * that doesn't exist on this machine. Common after `auth pair-remote` when
 * the post-pair check runs before the remote settings have been refreshed —
 * but also a real config gap when a user types an unknown id/name/URL by hand.
 *
 * The recovery is "configure this server" — list the canonical entry points
 * so the user can pick the right one for their setup.
 */
export function copyServerProfileMissing(_finding: ServerProfileMissing, invoker: string = 'kaiwu'): readonly string[] {
  return [
    '在 doctor repair 能处理该服务器前，需先进行配置。',
    '',
    '请选择适用项:',
    `  ${invoker} server add <url>             — 保存现有中继的服务器配置文件`,
    `  ${invoker} relay use --local            — 为当前频道激活本地中继`,
    `  ${invoker} auth pair-remote --ssh ...   — 将远程机器配对到此电脑的中继`,
  ];
}

export function copyAuthMissingForProfile(finding: AuthMissingForProfile, invoker: string = 'kaiwu'): readonly string[] {
  return [
    '请使用以下命令登录:',
    `  ${authSignInCommand(invoker, finding.serverId)}`,
  ];
}

export function copyAuthExpiredForActiveProfile(_finding: AuthExpiredForActiveProfile, invoker: string = 'kaiwu'): readonly string[] {
  return [
    '请重新登录:',
    `  ${authSignInCommand(invoker)}`,
  ];
}

export function copyMachineNotRegisteredForProfile(_finding: MachineNotRegisteredForProfile, invoker: string = 'kaiwu'): readonly string[] {
  return [
    '启动守护进程即可完成注册:',
    `  ${invoker} daemon start`,
  ];
}

export function copyDevOnHostedCloudInformational(invoker: string = 'kaiwu'): readonly string[] {
  return [
    'Dev 频道特性与本地 dev 中继配合效果最佳；云托管服务仅运行 stable 频道。',
    '',
    '安装本地 dev 中继:',
    `  ${invoker} relay host install --channel dev --yes`,
  ];
}

export function copyMultiStackDetectedInformational(finding: MultiStackDetectedInformational): readonly string[] {
  const lines: string[] = [];
  for (const s of finding.stacks) {
    const pid = s.runningDaemon ? ` (pid ${s.runningDaemon.pid})` : '';
    lines.push(`• ${s.releaseChannel} — ${s.archetype}${pid}`);
  }
  lines.push('');
  lines.push('并存配置属于正常使用场景 — 无需任何操作。');
  return lines;
}

export function copyBackgroundServiceNotRunning(_finding: BackgroundServiceNotRunning): FindingPromptCopy {
  // Header (bullet + title + muted detail line) is rendered by the
  // orchestrator via `formatFindingHeader()` — body is empty so the prompt
  // sits directly under the header.
  return {
    body: [],
    question: '是否立即启动？',
    default: 'yes',
  };
}

export function copyOrphanDaemonOnOtherChannel(finding: OrphanDaemonOnOtherChannel): readonly string[] {
  // Informational only — the classifier emits this ONLY for daemons on a
  // server profile that isn't the current CLI's active profile AND has no
  // current-channel service targeting it. In that case the daemon is
  // presumed intentional (separate stack) and we just surface the fact.
  // Header (gray bullet + title) comes from `formatFindingHeader()`; the
  // line below is the actionable hint.
  const channel = finding.daemon.startedWithReleaseChannel ?? '未知';
  return [
    chalk.gray(`使用 \`h${channel}\` 与之交互。`),
  ];
}

export function copyLocalRelayOffChannelLeftovers(
  finding: LocalRelayOffChannelLeftovers,
  invoker: string = 'kaiwu',
): readonly string[] {
  // Compact informational. One line per leftover relay + one line for the
  // remove-command hint. All muted — these are FYI, not action items. The
  // header (gray bullet + title) is rendered by `formatFindingHeader()`.
  const mute = (s: string) => chalk.gray(s);
  const cmd = (s: string) => chalk.cyan(s);
  const lines: string[] = [];
  for (const e of finding.leftovers) {
    const version = cleanRelayRuntimeVersion(e.version);
    const url = e.relayUrl ?? '未知 URL';
    lines.push(mute(`• ${e.releaseChannel} 本地中继 · ${version} · ${url}`));
  }
  lines.push(mute(`移除任意中继: ${cmd(`${invoker} relay host uninstall --channel <stable|preview|dev>`)}`));
  return lines;
}

export function copyBackgroundServiceCrashLooping(
  finding: BackgroundServiceCrashLooping,
  invoker: string = 'kaiwu',
): FindingPromptCopy {
  const { runs, lastExitCode, lastErrorLine, suspectedCause, conflictingDaemon } = finding;
  const body: string[] = [
    `启动失败 ${runs} 次（最近一次退出码: ${lastExitCode}）。`,
    'launchd 会持续尝试重新拉起，因此显示为“已停止”但实际上处于崩溃重启循环中。',
  ];
  if (lastErrorLine) {
    body.push('');
    body.push('服务 stderr 日志中的最后一条错误:');
    body.push(`  ${lastErrorLine}`);
  }
  body.push('');
  if (suspectedCause === 'conflicting_manual_daemon' && conflictingDaemon) {
    body.push(`可能的原因: 另一个守护进程（pid ${conflictingDaemon.pid}）已占用中继配置文件“${conflictingDaemon.serverId}”。`);
    body.push(`解决此冲突后，服务将在下次启动时正常接管。`);
    return {
      body,
      question: `是否停止冲突的守护进程（pid ${conflictingDaemon.pid}）并让服务接管？`,
      default: 'yes',
    };
  }
  if (suspectedCause === 'conflicting_manual_daemon') {
    body.push('可能的原因: 另一个守护进程占用了此中继配置文件。请停止所有手动启动的守护进程后重试。');
  } else if (suspectedCause === 'port_in_use') {
    body.push('可能的原因: 守护进程所需的端口被其他进程占用。');
  } else if (suspectedCause === 'auth_missing') {
    body.push('可能的原因: 此配置文件的身份认证缺失或已过期。');
  } else {
    body.push(`运行 \`${invoker} doctor\` 获取更深入的诊断信息。`);
  }
  return {
    body,
    question: `是否重试启动 ${finding.entry.releaseChannel} 后台服务？`,
    default: 'no',
  };
}
