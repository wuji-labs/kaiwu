import { compareMachineHosts } from '@happier-dev/protocol';

import type { CliSessionAttachEligibility } from './evaluateCliSessionAttachEligibility';

/**
 * Translate a non-eligible attach decision into a stable category + human copy
 * the selector can render under each disabled row, *and* the explicit
 * `happier attach <sessionId>` path can print as a friendly error.
 *
 * Why a separate explainer instead of expanding `evaluateCliSessionAttachEligibility`:
 * - The eligibility evaluator's contract is a *permission* boundary; it
 *   answers "may we attach?" with a structured `reasonCode`. Letting it also
 *   own user-visible prose would tangle two concerns.
 * - The reason copy depends on display-side context the evaluator doesn't
 *   need (current host, tmux availability, agent strategy). Keeping that
 *   coupling here means the evaluator stays minimal.
 * - The attach selector (interactive) and the explicit attach command (single
 *   id) both need the same explanation; a pure helper ensures they can't
 *   drift.
 *
 * Categories are coarser than the evaluator's reason codes on purpose — they
 * group reasons by *what the user can do about it*, which is what the footer
 * hint needs in order to suggest a next step.
 */
export type AttachIneligibilityCategory =
  | 'started_outside_tmux'        // session.terminal.mode === 'plain' on a tmux-strategy agent
  | 'windows_hidden'              // Windows session launched hidden/plain and cannot be attached later
  | 'tmux_unavailable'            // tmux strategy required but tmux not on PATH
  | 'remote_machine'              // session lives on another machine
  | 'machine_identity_mismatch'   // same host, but a different Happier machine id
  | 'no_local_state'              // local-host match, but no local attach state and no provider_attach
  | 'archived_or_inactive'
  | 'metadata_unreadable'
  | 'unsupported_agent';

export type AttachIneligibilityExplanation = Readonly<{
  category: AttachIneligibilityCategory;
  /** One-line, no period, terminal-friendly. Used as the selector sub-line. */
  shortReason: string;
  /** Full sentence ending in a period. Used in footer + explicit-attach error. */
  fullReason: string;
  /**
   * Optional second sentence the explicit-attach path can print to suggest
   * the user's next step. Suppressed in the selector to keep rows compact.
   */
  nextStepHint?: string;
}>;

export type AgentAttachStrategyForExplainer = 'tmux' | 'provider_attach' | 'unsupported' | null;

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readMetadataTerminalMode(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const terminal = metadata.terminal;
  if (!terminal || typeof terminal !== 'object' || Array.isArray(terminal)) return null;
  const mode = (terminal as Record<string, unknown>).mode;
  return typeof mode === 'string' ? mode : null;
}

function readMetadataTerminalRequested(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const terminal = metadata.terminal;
  if (!terminal || typeof terminal !== 'object' || Array.isArray(terminal)) return null;
  const requested = (terminal as Record<string, unknown>).requested;
  return typeof requested === 'string' ? requested : null;
}

/**
 * Decide which category best explains why this row is not attachable.
 *
 * Order matters: we check the most specific, user-actionable causes first
 * (archived, started-outside-tmux), and fall back to coarser causes
 * (remote machine, missing local state) when none of the specific ones fit.
 *
 * The two terminal-mode-aware branches use the *decrypted* metadata, which
 * the evaluator already produces as `eligibility.metadata`. We never trust
 * the plaintext list-row `host` to decide *whether* a session is attachable —
 * the evaluator owns that. Plaintext fields are display-only (see
 * attach selection's "include this row in the list" decision).
 */
export function explainAttachIneligibility(input: Readonly<{
  eligibility: Extract<CliSessionAttachEligibility, { eligible: false }>;
  metadata: Record<string, unknown> | null;
  currentMachineHost: string | null;
  tmuxAvailable: boolean;
  agentAttachStrategy: AgentAttachStrategyForExplainer;
}>): AttachIneligibilityExplanation {
  const { eligibility } = input;

  if (eligibility.reasonCode === 'archived' || eligibility.reasonCode === 'inactive') {
    return {
      category: 'archived_or_inactive',
      shortReason: eligibility.reasonCode === 'archived' ? '已归档' : '不再活跃',
      fullReason: eligibility.reasonCode === 'archived'
        ? '此会话已归档，无法接入。'
        : '此会话不再处于活跃状态，无法接入。',
      nextStepHint: '请使用 `kaiwu resume` 恢复已停止的会话。',
    };
  }

  if (eligibility.reasonCode === 'metadata_unavailable') {
    return {
      category: 'metadata_unreadable',
      shortReason: '无法在此机器上解密元数据',
      fullReason: '此 CLI 无法在此机器上解密该会话的元数据。',
      nextStepHint: '请使用最初创建会话的设备重新登录，或运行 `kaiwu auth pair-remote`。',
    };
  }

  if (input.agentAttachStrategy === 'unsupported') {
    return {
      category: 'unsupported_agent',
      shortReason: 'Agent 不支持接入',
      fullReason: '此会话的 Agent 不支持本地终端接入。',
    };
  }

  // Started outside tmux: highest-specificity, most user-actionable case.
  // The session's own metadata records exactly how it was launched. If the
  // mode is `plain` and the agent's attach strategy is `tmux`, we can never
  // re-attach to it — the foreground process has its own TTY, not a tmux
  // pane. This is the case the user just hit and was confused by.
  const terminalMode = readMetadataTerminalMode(input.metadata);
  const terminalRequested = readMetadataTerminalRequested(input.metadata);
  if (
    terminalMode === 'plain'
    && (terminalRequested === 'windows_terminal' || terminalRequested === 'console')
  ) {
    return {
      category: 'windows_hidden',
      shortReason: 'Windows 会话已隐藏启动',
      fullReason: '此 Windows 会话已隐藏启动，后续无法接入。',
      nextStepHint: '如需后续接入，请在启动会话时使用可见终端。',
    };
  }

  if (terminalMode === 'plain' && input.agentAttachStrategy === 'tmux') {
    return {
      category: 'started_outside_tmux',
      shortReason: '在 tmux 外部启动',
      fullReason: '此会话在 tmux 外部启动，无法接入。',
      nextStepHint: '请在 Kaiwu 应用 → 会话设置中启用“在 tmux 中启动会话”，然后启动新会话。',
    };
  }

  // tmux is the only supported attach strategy for this agent, but tmux is
  // not installed on this computer. (Distinct from "started outside tmux":
  // here the session might be in a tmux pane elsewhere, we just can't
  // dispatch an `attach` command from this CLI.)
  if (input.agentAttachStrategy === 'tmux' && !input.tmuxAvailable) {
    return {
      category: 'tmux_unavailable',
      shortReason: '此计算机上未安装 tmux',
      fullReason: '接入此会话需要 tmux，但此计算机上未安装 tmux。',
      nextStepHint: '请安装 tmux（例如 macOS 上运行 `brew install tmux`）后重试。',
    };
  }

  // Remote-machine case: distinguish by reading host from decrypted metadata
  // first (auth'd via the encryption key), falling back to current-machine
  // checks the evaluator already did. Note we use `compareMachineHosts` so
  // `mbp` and `mbp.local` are treated as equal.
  if (eligibility.reasonCode === 'not_current_machine') {
    const sessionHost = readMetadataString(input.metadata, 'host');
    if (sessionHost && input.currentMachineHost && compareMachineHosts(sessionHost, input.currentMachineHost)) {
      return {
        category: 'machine_identity_mismatch',
        shortReason: 'Kaiwu 机器标识不同；无可用终端接入目标',
        fullReason: '此会话以不同的 Kaiwu 机器标识在此计算机上运行，但此 CLI 没有对应的 tmux 目标或本地接入标记。',
        nextStepHint: '请使用启动该会话的同一 Kaiwu 应用或守护进程，或从此 CLI 配置启动新的基于 tmux 的会话。',
      };
    }

    const remoteSuffix = sessionHost ? `（${sessionHost}）` : '';
    return {
      category: 'remote_machine',
      shortReason: `正在另一台机器上运行${remoteSuffix}`,
      fullReason: sessionHost
        ? `此会话正在 ${sessionHost} 上运行，无法从此计算机接入。`
        : '会话属于另一台机器，无法从此计算机接入。',
      nextStepHint: '请切换到该机器，或使用 `kaiwu session list --active` 查看所有正在运行的会话。',
    };
  }

  // The session has a host that doesn't match this machine even when the
  // evaluator's reason code didn't explicitly say "not_current_machine"
  // (older evaluators or edge cases). Treat that as remote too.
  if (input.currentMachineHost) {
    const sessionHost = readMetadataString(input.metadata, 'host');
    if (sessionHost && !compareMachineHosts(sessionHost, input.currentMachineHost)) {
      return {
        category: 'remote_machine',
        shortReason: `正在 ${sessionHost} 上运行`,
        fullReason: `此会话正在 ${sessionHost} 上运行，无法从此计算机接入。`,
        nextStepHint: '请切换到该机器，或使用 `kaiwu session list --active` 查看所有正在运行的会话。',
      };
    }
  }

  // Default for everything else: missing_local_attach_state, current_machine_unknown,
  // session_machine_unknown, provider_attach_unavailable, terminal_not_attachable.
  return {
    category: 'no_local_state',
    shortReason: '此计算机上无可用接入状态',
    fullReason: '此计算机上没有该会话的本地接入状态。',
    nextStepHint: '请使用 `kaiwu daemon start` 启动守护进程并重试，或从原始终端接入。',
  };
}

/**
 * Pick the dominant category among an array of explanations. Used by the
 * footer hint to suggest a next step matched to the most common cause —
 * we don't want to nag about tmux when the actual problem is "all your
 * sessions are on another machine".
 *
 * Returns `null` when the input is empty.
 */
export function resolveDominantAttachIneligibilityCategory(
  explanations: readonly AttachIneligibilityExplanation[],
): AttachIneligibilityCategory | null {
  if (explanations.length === 0) return null;
  const counts = new Map<AttachIneligibilityCategory, number>();
  for (const explanation of explanations) {
    counts.set(explanation.category, (counts.get(explanation.category) ?? 0) + 1);
  }
  let best: { category: AttachIneligibilityCategory; count: number } | null = null;
  for (const [category, count] of counts) {
    if (!best || count > best.count) best = { category, count };
  }
  return best?.category ?? null;
}
