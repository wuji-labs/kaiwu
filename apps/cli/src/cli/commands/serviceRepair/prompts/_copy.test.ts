import { describe, expect, it } from 'vitest';

import type {
  AuthExpiredForActiveProfile,
  AuthMissingForProfile,
  AutomaticStartupEntry,
  AutomaticStartupLaneMismatch,
  AutomaticStartupLegacyPinnedCurrentServer,
  AutomaticStartupMissing,
  NoActiveStackYet,
} from '@/diagnostics/doctorRepair';

import {
  CLEAN_STATE_HEADER,
  confirmBackgroundServiceRestarted,
  confirmDaemonRestarted,
  copyAuthExpiredForActiveProfile,
  copyAuthMissingForProfile,
  copyLaneMismatch,
  copyLegacyPinnedCurrentServer,
  copyNoServersConfigured,
  findingHeadline,
  MISMATCHED_STATE_HEADER,
  recapNothingToDo,
} from './_copy';

function makeEntry(
  overrides: Partial<AutomaticStartupEntry> = {},
): AutomaticStartupEntry {
  return {
    serverId: 'default',
    name: 'Default automatic startup',
    releaseChannel: 'preview',
    ringId: 'preview',
    mode: 'user',
    targetMode: 'pinned',
    relayUrl: 'https://api.happier.dev',
    running: true,
    configuredCliVersion: '0.2.6-preview.1.1',
    runningCliVersion: '0.2.6-preview.1.1',
    path: '/tmp/happier-home/Library/LaunchAgents/com.happier.default.preview.plist',
    happierHomeDir: '/tmp/happier-home',
    isForeignHome: false,
    installedDefinitionMatchesExpected: true,
    isLegacyChannelScoped: false,
    ...overrides,
  };
}

describe('serviceRepair prompt copy', () => {
  it('renders localized headers, headlines, and recaps in natural simplified Chinese', () => {
    expect(CLEAN_STATE_HEADER).toContain('Kaiwu 安装状态良好');
    expect(MISMATCHED_STATE_HEADER).toContain('Kaiwu 配置可能需要处理');

    const noStackFinding: NoActiveStackYet = {
      kind: 'no_active_stack_yet',
      severity: 'info',
      autoApplyWithoutPrompt: false,
      releaseChannel: 'stable',
    };
    expect(findingHeadline(noStackFinding)).toBe('尚无运行中的 Kaiwu 服务栈 — 启动一个即可开始使用 Kaiwu');

    const missingFinding: AutomaticStartupMissing = {
      kind: 'automatic_startup_missing',
      severity: 'warning',
      autoApplyWithoutPrompt: false,
      targetReleaseChannel: 'stable',
      preferredMode: 'user',
    };
    expect(findingHeadline(missingFinding)).toBe('未配置开机自启后台服务');

    expect(recapNothingToDo('kaiwu')).toBe('全部完成。随时可以安全地重新运行 `kaiwu doctor repair`。');
    expect(confirmBackgroundServiceRestarted()).toBe(' ✔ 后台服务已重启。');
    expect(confirmDaemonRestarted(1234)).toBe(' ✔ 守护进程已重启（pid 1234）。');
  });

  it('mentions the selected channel in lane-mismatch move question', () => {
    const finding: AutomaticStartupLaneMismatch = {
      kind: 'automatic_startup_lane_mismatch',
      severity: 'warning',
      autoApplyWithoutPrompt: false,
      existing: [makeEntry()],
      targetReleaseChannel: 'dev',
    };
    const copy = copyLaneMismatch(finding, { releaseChannel: 'dev', version: '0.2.6-dev.2.1' });
    expect(copy.question).toBe('是否将自动启动的后台服务切换到 dev 频道？');
    expect(copy.body).toContain('刚安装的 CLI:           dev • 0.2.6-dev.2.1');
    expect(copy.body).toContain('自动启动服务当前位于:   preview • 0.2.6-preview.1.1');
  });

  it('explains default-following and includes channel in legacy-pinned question', () => {
    const finding: AutomaticStartupLegacyPinnedCurrentServer = {
      kind: 'automatic_startup_legacy_pinned_current_server',
      severity: 'warning',
      autoApplyWithoutPrompt: false,
      entry: makeEntry(),
    };
    const copy = copyLegacyPinnedCurrentServer(finding, {
      releaseChannel: 'dev',
      version: '0.2.6-dev.2.1',
    });
    expect(copy.question).toBe(
      '是否将此自动启动后台服务切换为 dev 上的跟随默认配置？',
    );
    expect(copy.body).toContain('当前推荐使用动态配置（跟随默认设置），自动跟随当前使用的服务器，');
    expect(copy.body).toContain('这样在切换服务器时无需重新安装。');
    expect(copy.body).toContain('刚安装的 CLI:           dev • 0.2.6-dev.2.1');
    expect(copy.body).toContain('自动启动服务当前位于:   preview • 0.2.6-preview.1.1');
  });

  it('prints an executable sign-in command for an expired active profile', () => {
    const finding: AuthExpiredForActiveProfile = {
      kind: 'auth_expired_for_active_profile',
      severity: 'warning',
      autoApplyWithoutPrompt: false,
      serverId: 'cloud',
      serverName: 'Cloud',
      serverUrl: 'https://api.happier.dev',
    };
    const copy = copyAuthExpiredForActiveProfile(finding, 'hdev');

    // `happier auth` alone only prints help; the remedy must be the parsed
    // `auth login` form so the printed command actually runs.
    expect(copy).toContain('  hdev auth login');
    expect(copy).not.toContain('  hdev auth\n');
  });

  it('prints the same executable sign-in command the doctor report renders', () => {
    const finding: AuthMissingForProfile = {
      kind: 'auth_missing_for_profile',
      severity: 'warning',
      autoApplyWithoutPrompt: false,
      serverId: 'company',
      serverName: 'Company',
      serverUrl: 'https://relay.company.test',
    };
    const copy = copyAuthMissingForProfile(finding, 'hdev');

    expect(copy).toContain('  hdev auth login --server company');
    expect(copy).not.toContain('hdev auth --server company');
  });

  it('names the parsed sign-in command when no server profile exists yet', () => {
    const copy = copyNoServersConfigured('hdev');

    expect(copy).toContain('  hdev auth login');
    expect(copy.join('\n')).not.toMatch(/^\s*hdev auth\s*$/m);
  });
});
