import type { PendingDeliveryBlocker } from '@/agent/runtime/session/pendingDelivery/undeliverableProviderPrompt';

import type { ClaudeUnifiedDeliveryBlocker } from './_types';
import type { ClaudeUnifiedDraftGuardStarvationInfo } from './createClaudeUnifiedPromptInjector';
import {
  isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive,
  resolveClaudeUnifiedPendingDeliveryBlock,
  resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker,
  type ClaudeUnifiedProviderUnavailablePromptDeliveryWindow,
} from './pendingDeliveryBlock';
import { isClaudeUnifiedRuntimeControlUserDraftBlocker } from './runtimeControlIntegration';
import { isClaudeUnifiedTerminalAmbiguousInjectionFailureError } from './terminalInjectionFailureError';
import { isClaudeUnifiedDialogBlockedReason } from './tuiControls/dialogRegistry';

export type ClaudeUnifiedTerminalRuntimeIssueHandlingResult =
  | boolean
  | void
  | Readonly<{ action: 'claimed_pending_delivery' }>
  | Readonly<{ action: 'surfaced_runtime_issue' }>;

function canDurablyBlockSustainedClaudeUnifiedBlocker(params: Readonly<{
  blocker: ClaudeUnifiedDeliveryBlocker | null | undefined;
  isCanonicalTurnActive?: boolean | undefined;
}>): boolean {
  if (params.isCanonicalTurnActive !== false) return false;
  const blocker = params.blocker;
  if (!blocker) return false;
  if (blocker.kind === 'provider_unavailable') return true;
  if (blocker.kind === 'terminal_user_draft') {
    return (blocker as { guardStatus?: unknown }).guardStatus === 'foreign_draft';
  }
  if (blocker.kind === 'runtime_config_blocked') {
    const blockedReason = (blocker as { blockedReason?: unknown }).blockedReason;
    return isClaudeUnifiedRuntimeControlUserDraftBlocker(
      typeof blockedReason === 'string' ? blockedReason : undefined,
    );
  }
  if (blocker.kind === 'terminal_busy') {
    return blocker.source === 'readiness' && isClaudeUnifiedDialogBlockedReason(blocker.detail);
  }
  return false;
}

export function resolveClaudeUnifiedDraftGuardStarvationBlocker(
  info: ClaudeUnifiedDraftGuardStarvationInfo,
): ClaudeUnifiedDeliveryBlocker {
  if (info.guardStatus === 'blocked_non_input_state') {
    return {
      kind: 'terminal_busy',
      source: 'readiness',
      detail: info.blockedReason ?? 'non_input_state',
    };
  }
  if (info.guardStatus === 'clear_failed') {
    return {
      kind: 'own_leftover_clear_failed',
      source: 'draft_guard',
      guardStatus: info.guardStatus,
      ...(info.draftLength !== undefined ? { draftLength: info.draftLength } : {}),
    };
  }
  if (info.guardStatus === 'capture_style_unavailable') {
    return {
      kind: 'capture_ambiguous',
      source: 'draft_guard',
      guardStatus: info.guardStatus,
      ...(info.draftLength !== undefined ? { draftLength: info.draftLength } : {}),
    };
  }
  return {
    kind: 'terminal_user_draft',
    source: 'draft_guard',
    guardStatus: info.guardStatus,
    ...(info.draftLength !== undefined ? { draftLength: info.draftLength } : {}),
  };
}

export type ClaudeUnifiedSustainedPendingDeliveryBlockHandler = Readonly<{
  blockForSustainedBlocker(params: Readonly<{
    localIds: readonly string[] | null | undefined;
    blocker: ClaudeUnifiedDeliveryBlocker | null | undefined;
    isCanonicalTurnActive?: boolean | undefined;
  }>): Promise<boolean>;
  wakePendingMaterialization(): void;
}>;

export function createClaudeUnifiedSustainedPendingDeliveryBlockHandler(params: Readonly<{
  blockPendingMessageDelivery?: PendingDeliveryBlocker | undefined;
  wakePendingMaterialization?: (() => void) | undefined;
  logPrefix: string;
  logDebug: (message: string, error: unknown) => void;
}>): ClaudeUnifiedSustainedPendingDeliveryBlockHandler {
  return {
    async blockForSustainedBlocker(blockParams): Promise<boolean> {
      if (!canDurablyBlockSustainedClaudeUnifiedBlocker(blockParams)) return false;
      return blockClaudeUnifiedPendingDeliveryForBlocker({
        localIds: blockParams.localIds,
        blocker: blockParams.blocker,
        blockPendingMessageDelivery: params.blockPendingMessageDelivery,
        logPrefix: params.logPrefix,
        logDebug: params.logDebug,
      });
    },
    wakePendingMaterialization(): void {
      params.wakePendingMaterialization?.();
    },
  };
}

export async function blockClaudeUnifiedPendingDeliveryForBlocker(params: Readonly<{
  localIds: readonly string[] | null | undefined;
  blocker: ClaudeUnifiedDeliveryBlocker | null | undefined;
  blockPendingMessageDelivery?: PendingDeliveryBlocker | undefined;
  logPrefix: string;
  logDebug: (message: string, error: unknown) => void;
}>): Promise<boolean> {
  const pendingDeliveryBlock = resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker({
    localIds: params.localIds,
    blocker: params.blocker,
  });
  if (!pendingDeliveryBlock || !params.blockPendingMessageDelivery) return false;
  return params.blockPendingMessageDelivery(pendingDeliveryBlock).catch((error) => {
    params.logDebug(`${params.logPrefix}: failed to block Claude unified terminal pending delivery (non-fatal)`, error);
    return false;
  });
}

export async function handleClaudeUnifiedTerminalRuntimeIssuePendingDeliveryBlock(params: Readonly<{
  error: unknown;
  providerUnavailableWindow: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null;
  setProviderUnavailableWindow: (window: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null) => void;
  blockPendingMessageDelivery?: PendingDeliveryBlocker | undefined;
  nowMs?: (() => number) | undefined;
  currentModelId?: string | null | undefined;
  logPrefix: string;
  logDebug: (message: string, error: unknown) => void;
  deferAmbiguousRuntimeIssue?: boolean | undefined;
  beforeSurfaceRuntimeIssue?: (() => void) | undefined;
  surfaceRuntimeIssue: (error: unknown) => Promise<boolean | null | undefined>;
  onSurfacedRuntimeIssue?: (() => void | Promise<void>) | undefined;
}>): Promise<ClaudeUnifiedTerminalRuntimeIssueHandlingResult> {
  const nowMs = params.nowMs?.() ?? Date.now();
  if (!isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(params.providerUnavailableWindow, nowMs, params.currentModelId)) {
    params.setProviderUnavailableWindow(null);
  }

  const pendingDeliveryBlock = resolveClaudeUnifiedPendingDeliveryBlock(params.error);
  let didBlockPendingDelivery = false;
  if (pendingDeliveryBlock && params.blockPendingMessageDelivery) {
    didBlockPendingDelivery = await params.blockPendingMessageDelivery(pendingDeliveryBlock).catch((error) => {
      params.logDebug(`${params.logPrefix}: failed to block Claude unified terminal pending delivery (non-fatal)`, error);
      return false;
    });
    if (didBlockPendingDelivery) {
      return { action: 'claimed_pending_delivery' };
    }
  }

  // An exact pre-write steer rejection describes only the attempted Pending input. If its
  // durable block cannot be recorded, keep that input parked locally; the already-running
  // foreground turn remains owned by Claude lifecycle evidence rather than bookkeeping failure.
  if (pendingDeliveryBlock?.reason === 'steering_unavailable') {
    return;
  }

  if (params.deferAmbiguousRuntimeIssue === true && isClaudeUnifiedTerminalAmbiguousInjectionFailureError(params.error)) {
    return;
  }

  params.beforeSurfaceRuntimeIssue?.();
  const surfaced = await params.surfaceRuntimeIssue(params.error);
  if (surfaced) {
    await params.onSurfacedRuntimeIssue?.();
    if (!didBlockPendingDelivery) return { action: 'surfaced_runtime_issue' };
  }
  if (didBlockPendingDelivery) return { action: 'claimed_pending_delivery' };
  return surfaced ?? undefined;
}
