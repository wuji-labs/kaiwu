import { getAgentLocalControlCapability, type AgentId } from '@happier-dev/agents';
import { compareMachineHosts } from '@happier-dev/protocol';
import type { AccountSettings } from '@happier-dev/protocol';

import { getProviderAttachOps } from '@/backends/catalog';
import { configuration } from '@/configuration';
import type { Credentials } from '@/persistence';
import { buildCliSessionRowModel } from '@/cli/output/session/buildCliSessionRowModel';
import { evaluateCliSessionAttachEligibility } from '@/session/attach/evaluateCliSessionAttachEligibility';
import type { CliSessionAttachEligibility } from '@/session/attach/evaluateCliSessionAttachEligibility';
import {
  explainAttachIneligibility,
  resolveDominantAttachIneligibilityCategory,
  type AgentAttachStrategyForExplainer,
  type AttachIneligibilityCategory,
  type AttachIneligibilityExplanation,
} from '@/session/attach/explainAttachIneligibility';
import {
  resolveEffectiveSessionTmuxFromAccountSettings,
  type EffectiveSessionTmuxResolution,
} from '@/session/attach/resolveEffectiveSessionTmuxFromAccountSettings';
import type { RawSessionListRow } from '@/session/transport/http/sessionsHttp';
import type { TerminalAttachmentInfo } from '@/terminal/attachment/terminalAttachmentInfo';
import type { SessionActionSelectorRow } from '@/ui/ink/SessionActionSelector';

type FetchSessionsPageFn = (params: {
  token: string;
  cursor?: string;
  limit?: number;
  activeOnly?: boolean;
  archivedOnly?: boolean;
}) => Promise<{
  sessions: RawSessionListRow[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

type ReadTerminalAttachmentInfoFn = (params: {
  happyHomeDir: string;
  sessionId: string;
}) => Promise<TerminalAttachmentInfo | null>;

type IsTmuxAvailableFn = () => Promise<boolean>;

export type AttachSelectionFooterHint = Readonly<{
  /**
   * Most common reason rows are not attachable. Drives the footer copy in
   * the selector — see `formatAttachIneligibilityFooter` for the
   * category-to-text mapping.
   */
  dominantCategory: AttachIneligibilityCategory | null;
  attachableCount: number;
  ineligibleCount: number;
  /**
   * The effective "spawn sessions in tmux" preference for the current
   * machine, mirroring the UI's `resolveTerminalSpawnOptions` resolver.
   * `null` when account settings could not be loaded.
   */
  effectiveSessionTmux: EffectiveSessionTmuxResolution | null;
}>;

export type AttachSelectionModel = Readonly<{
  rows: SessionActionSelectorRow[];
  hint: AttachSelectionFooterHint;
  probeSessionIdFn: (sessionId: string) => Promise<{ reachable: boolean; reason?: string }>;
}>;

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveAgentAttachStrategy(agentId: AgentId | string | null | undefined): AgentAttachStrategyForExplainer {
  if (!agentId) return null;
  const capability = getAgentLocalControlCapability(agentId as AgentId);
  if (!capability) return 'unsupported';
  return capability.attachStrategy;
}

/**
 * Decide whether to *show* this row in the attach selector. This is a display
 * gate, not an attachability gate — `evaluateCliSessionAttachEligibility` is
 * the only thing that decides whether the user can actually attach.
 *
 * Inclusion signals:
 * - `localInfo` exists → unambiguously this machine.
 * - decrypted `metadata.machineId === currentMachineId` → authoritative
 *   "this machine" signal, gated by the e2ee key.
 * - decrypted `metadata.host` matches `currentMachineHost` (after
 *   `compareMachineHosts` normalisation) → display-only proxy when machineId
 *   is missing, useful for older sessions and codex/plain sessions where
 *   machineId may not be populated.
 * - agent uses `provider_attach` → opencode-style sessions can be reached
 *   regardless of host.
 */
function shouldIncludeRowInSelector(input: Readonly<{
  hasLocalInfo: boolean;
  metadataMachineId: string | null;
  currentMachineId: string | null;
  metadataHost: string | null;
  currentMachineHost: string | null;
  agentAttachStrategy: AgentAttachStrategyForExplainer;
}>): boolean {
  if (input.hasLocalInfo) return true;
  if (input.metadataMachineId && input.currentMachineId && input.metadataMachineId === input.currentMachineId) return true;
  if (input.agentAttachStrategy === 'provider_attach') return true;
  if (compareMachineHosts(input.metadataHost, input.currentMachineHost)) return true;
  return false;
}

export async function buildAttachSelectionModel(params: Readonly<{
  credentials: Credentials;
  currentMachineId: string | null;
  currentMachineHost: string;
  fetchSessionsPageFn: FetchSessionsPageFn;
  readTerminalAttachmentInfoFn: ReadTerminalAttachmentInfoFn;
  isTmuxAvailableFn: IsTmuxAvailableFn;
  accountSettings: AccountSettings | null;
}>): Promise<AttachSelectionModel> {
  const page = await params.fetchSessionsPageFn({
    token: params.credentials.token,
    limit: 200,
    activeOnly: true,
  });
  const tmuxAvailable = await params.isTmuxAvailableFn();
  const rows: SessionActionSelectorRow[] = [];
  const ineligibilityExplanations: AttachIneligibilityExplanation[] = [];
  const remoteProviderMetadataBySessionId = new Map<string, { agentId: AgentId; metadata: Record<string, unknown> }>();

  for (const rawSession of page.sessions) {
    const rowModel = buildCliSessionRowModel({ credentials: params.credentials, rawSession });
    if (rowModel.isSystem) continue;

    const localInfo = await params.readTerminalAttachmentInfoFn({
      happyHomeDir: configuration.happyHomeDir,
      sessionId: rawSession.id,
    });

    const eligibility: CliSessionAttachEligibility = await evaluateCliSessionAttachEligibility({
      credentials: params.credentials,
      rawSession,
      currentMachineId: params.currentMachineId,
      currentMachineHost: params.currentMachineHost,
      localAttachmentInfo: localInfo,
      insideTmux: Boolean(process.env.TMUX),
      currentTmuxSocketPath: typeof process.env.TMUX === 'string' ? process.env.TMUX.split(',')[0]?.trim() || null : null,
    });

    const metadata = eligibility.metadata ?? null;
    const metadataMachineId = readMetadataString(metadata, 'machineId');
    const metadataHost = readMetadataString(metadata, 'host');
    const agentAttachStrategy = resolveAgentAttachStrategy(rowModel.agentId);

    const include = shouldIncludeRowInSelector({
      hasLocalInfo: localInfo !== null,
      metadataMachineId,
      currentMachineId: params.currentMachineId,
      metadataHost,
      currentMachineHost: params.currentMachineHost,
      agentAttachStrategy,
    });
    if (!include) continue;

    if (eligibility.eligible) {
      // Attachable, including the special remote-provider-attach case where
      // the user can press P to probe reachability before committing.
      const isRemoteProviderAttach =
        eligibility.attachStrategy === 'provider_attach' && eligibility.attachScope === 'remote';

      if (isRemoteProviderAttach) {
        remoteProviderMetadataBySessionId.set(rowModel.id, {
          agentId: rowModel.agentId as AgentId,
          metadata: eligibility.metadata,
        });
      }

      rows.push({
        sessionId: rowModel.id,
        agentId: rowModel.agentId,
        updatedAt: rowModel.updatedAt,
        title: [rowModel.tag, rowModel.title].filter((value) => typeof value === 'string' && value.trim().length > 0).join(' · '),
        path: rowModel.path ?? '',
        annotation: isRemoteProviderAttach ? '远程' : null,
        probeable: isRemoteProviderAttach,
        // Remote provider-attach rows start disabled until the user proves
        // reachability with `P` — the selector's probe handler flips them
        // to `disabled: false` on success.
        disabled: isRemoteProviderAttach ? true : false,
        disabledReason: isRemoteProviderAttach ? '按 P 检查远程连通性。' : null,
      });
      continue;
    }

    // Not eligible — show the row, but mark it disabled with the reason so
    // the user understands *why* this otherwise-running session can't be
    // attached.
    const explanation = explainAttachIneligibility({
      eligibility,
      metadata,
      currentMachineHost: params.currentMachineHost,
      tmuxAvailable,
      agentAttachStrategy,
    });
    ineligibilityExplanations.push(explanation);

    rows.push({
      sessionId: rowModel.id,
      agentId: rowModel.agentId,
      updatedAt: rowModel.updatedAt,
      title: [rowModel.tag, rowModel.title].filter((value) => typeof value === 'string' && value.trim().length > 0).join(' · '),
      path: rowModel.path ?? '',
      annotation: explanation.shortReason,
      probeable: false,
      disabled: true,
      disabledReason: explanation.fullReason,
    });
  }

  // Attachable rows first (newest first within group), disabled rows after
  // (newest first within group). Matches the user's spec: ready-to-attach at
  // the top, can't-attach below with reasons.
  rows.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });

  const hint: AttachSelectionFooterHint = {
    dominantCategory: resolveDominantAttachIneligibilityCategory(ineligibilityExplanations),
    attachableCount: rows.filter((row) => !row.disabled).length,
    ineligibleCount: ineligibilityExplanations.length,
    effectiveSessionTmux: resolveEffectiveSessionTmuxFromAccountSettings({
      accountSettings: params.accountSettings,
      currentMachineId: params.currentMachineId,
    }),
  };

  return {
    rows,
    hint,
    probeSessionIdFn: async (sessionId) => {
      const remoteProvider = remoteProviderMetadataBySessionId.get(sessionId);
      if (!remoteProvider) {
        return { reachable: false, reason: '此会话不支持远程连通性探测。' };
      }
      const providerAttachOps = await getProviderAttachOps(remoteProvider.agentId);
      if (!providerAttachOps?.probeReachability) {
        return { reachable: false, reason: '此 Provider 不支持远程连通性探测。' };
      }
      return await providerAttachOps.probeReachability({
        metadata: remoteProvider.metadata,
      });
    },
  };
}

/**
 * Render the contextual footer hint shown under the selector's keyboard
 * help. Stays silent when there's nothing actionable to say (e.g. the user
 * has eligible sessions and no inelegible-but-running ones).
 */
export function formatAttachIneligibilityFooter(hint: AttachSelectionFooterHint): string | null {
  if (hint.ineligibleCount === 0) return null;

  const tmux = hint.effectiveSessionTmux;
  const ineligible = hint.ineligibleCount;

  switch (hint.dominantCategory) {
    case 'started_outside_tmux': {
      if (tmux && !tmux.useTmux) {
        const scope = tmux.source === 'machine-override'
          ? '（此计算机）'
          : '';
        return `此机器上有 ${ineligible} 个会话在 tmux 外部启动，无法接入。`
          + `请在 Kaiwu 应用 → 会话设置中启用“在 tmux 中启动会话”${scope}，然后启动新会话。`;
      }
      return `此机器上有 ${ineligible} 个会话在启用“在 tmux 中启动会话”之前启动。`
        + `您现在启动的新会话将支持接入。`;
    }
    case 'tmux_unavailable':
      return `此计算机上未安装 tmux。请安装 tmux（例如 macOS 上运行 \`brew install tmux\`）以使 codex/claude 会话支持接入。`;
    case 'windows_hidden':
      return `${ineligible} 个隐藏的 Windows 会话在启动后无法接入。`
        + `如需后续接入，请在启动时使用可见终端。`;
    case 'machine_identity_mismatch':
      return `此计算机上有 ${ineligible} 个会话以不同的 Kaiwu 机器标识运行，但无可用 tmux 目标或本地接入标记。`
        + `请使用启动该会话的同一 Kaiwu 应用或守护进程，或从此 CLI 配置启动新的基于 tmux 的会话。`;
    case 'remote_machine':
      return `有 ${ineligible} 个会话正在其他机器上运行。请使用 \`kaiwu session list --active\` 查看所有正在运行的会话。`;
    case 'no_local_state':
      return `有 ${ineligible} 个会话正在运行，但其本地接入状态不可见。`
        + `请尝试运行 \`kaiwu daemon start\` 并重试，或从原始终端接入。`;
    case 'archived_or_inactive':
      return `有 ${ineligible} 个会话不再处于活跃状态。请使用 \`kaiwu resume\` 恢复已停止的会话。`;
    case 'metadata_unreadable':
      return `有 ${ineligible} 个会话无法在此机器上解密。请在原始设备上登录，或通过 \`kaiwu auth pair-remote\` 进行配对。`;
    case 'unsupported_agent':
      return `有 ${ineligible} 个会话使用的 Agent 不支持本地终端接入。`;
    default:
      return null;
  }
}
