import type { PendingQueueDeliveryBlockedReason } from '@/api/session/pendingQueueV2Transport';
import { readPendingLocalId } from '@happier-dev/protocol';

import type { NormalizedProviderUsageLimitDetailsV1 } from '../connectedServices/mapClaudeRateLimitEventToUsageDetails';
import type { ClaudeUnifiedDeliveryBlocker } from './_types';
import { isClaudeUnifiedDialogBlockedReason } from './tuiControls/dialogRegistry';
import {
  isClaudeUnifiedTerminalInjectionFailureError,
} from './terminalInjectionFailureError';

export type ClaudeUnifiedPendingDeliveryBlock = Readonly<{
  localIds: readonly string[];
  reason: PendingQueueDeliveryBlockedReason;
  providerEffect?: 'none';
}>;

export type ClaudeUnifiedProviderUnavailablePromptDeliveryWindow = Readonly<{
  unavailableUntilMs: number;
  modelFamily?: string;
}>;

export const CLAUDE_UNIFIED_CAPACITY_PROVIDER_UNAVAILABLE_MAX_WINDOW_MS = 30_000;

const CLAUDE_UNIFIED_USAGE_LIMIT_DIALOG_PROVIDER_UNAVAILABLE_WINDOW_MS = 5 * 60_000;

function readFutureTimestampMs(value: unknown, nowMs: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const timestampMs = Math.trunc(value);
  return timestampMs > nowMs ? timestampMs : null;
}

function readPositiveDurationMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const durationMs = Math.trunc(value);
  return durationMs > 0 ? durationMs : null;
}

export function resolveClaudeModelScopedLimitFamily(
  details: NormalizedProviderUsageLimitDetailsV1,
): string | null {
  const providerLimitId = details.providerLimitId;
  if (!providerLimitId) return null;
  if (providerLimitId.startsWith('model_limit:')) {
    const family = providerLimitId.slice('model_limit:'.length).trim().toLowerCase();
    return family.length > 0 ? family : null;
  }
  const lower = providerLimitId.toLowerCase();
  const match = lower.match(/(opus|sonnet|haiku|fable)/);
  if (match) {
    return match[1];
  }
  return null;
}

export function resolveClaudeUnifiedProviderUnavailableUntilMs(
  details: NormalizedProviderUsageLimitDetailsV1,
  observedAtMs: number,
): number | null {
  const candidates = [
    readFutureTimestampMs(details.resetAtMs, observedAtMs),
    readFutureTimestampMs(details.overage?.resetAtMs, observedAtMs),
  ];
  const retryAfterMs = readPositiveDurationMs(details.retryAfterMs);
  if (retryAfterMs !== null) {
    candidates.push(observedAtMs + retryAfterMs);
  }

  const futureCandidates = candidates.filter((candidate): candidate is number => candidate !== null);
  const candidateUntilMs = futureCandidates.length > 0 ? Math.max(...futureCandidates) : null;
  if (details.limitCategory === 'capacity') {
    const maxWindowUntilMs = observedAtMs + CLAUDE_UNIFIED_CAPACITY_PROVIDER_UNAVAILABLE_MAX_WINDOW_MS;
    if (candidateUntilMs === null) {
      return maxWindowUntilMs;
    }
    return Math.min(candidateUntilMs, maxWindowUntilMs);
  }
  return candidateUntilMs;
}

export function resolveClaudeUnifiedProviderUnavailableWindowForUsageLimitDialog(
  observedAtMs: number,
): ClaudeUnifiedProviderUnavailablePromptDeliveryWindow {
  const unavailableUntilMs = resolveClaudeUnifiedProviderUnavailableUntilMs({
    v: 1,
    resetAtMs: null,
    retryAfterMs: CLAUDE_UNIFIED_USAGE_LIMIT_DIALOG_PROVIDER_UNAVAILABLE_WINDOW_MS,
    limitCategory: 'usage_limit',
    quotaScope: 'account',
    recoverability: 'wait',
    providerLimitId: 'usage_limit_dialog',
    planType: null,
    utilization: null,
    overage: null,
    action: null,
    connectedService: null,
  }, observedAtMs);

  return {
    unavailableUntilMs: unavailableUntilMs ?? observedAtMs + CLAUDE_UNIFIED_USAGE_LIMIT_DIALOG_PROVIDER_UNAVAILABLE_WINDOW_MS,
  };
}

export function isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(
  window: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null,
  nowMs: number,
  currentModelId?: string | null,
): window is ClaudeUnifiedProviderUnavailablePromptDeliveryWindow {
  if (window === null || nowMs >= window.unavailableUntilMs) {
    return false;
  }
  if (
    typeof window.modelFamily === 'string' &&
    window.modelFamily.length > 0 &&
    typeof currentModelId === 'string' &&
    currentModelId.trim().length > 0
  ) {
    if (!currentModelId.toLowerCase().includes(window.modelFamily.toLowerCase())) {
      return false;
    }
  }
  return true;
}

export type ClaudeUnifiedProviderUnavailableDeliveryWindowTracker = Readonly<{
  getWindow(): ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null;
  setWindow(window: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null): void;
  isActive(nowMs?: number, currentModelId?: string | null): boolean;
  dispose(): void;
}>;

export function createClaudeUnifiedProviderUnavailableDeliveryWindowTracker(params: Readonly<{
  onWindowEnded: () => void | Promise<unknown>;
  nowMs?: (() => number) | undefined;
  setTimeout?: ((callback: () => void, ms: number) => any) | undefined;
  clearTimeout?: ((timer: any) => void) | undefined;
}>): ClaudeUnifiedProviderUnavailableDeliveryWindowTracker {
  let currentWindow: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null = null;
  let activeTimer: any = null;
  let isDisposed = false;

  const clearActiveTimer = (): void => {
    if (activeTimer !== null) {
      const clearFn = params.clearTimeout ?? clearTimeout;
      clearFn(activeTimer);
      activeTimer = null;
    }
  };

  const scheduleTimerForWindow = (window: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow): void => {
    const now = params.nowMs?.() ?? Date.now();
    const delay = Math.max(0, window.unavailableUntilMs - now);
    const timeoutFn = params.setTimeout ?? setTimeout;
    activeTimer = timeoutFn(() => {
      activeTimer = null;
      if (isDisposed) return;
      if (currentWindow === window) {
        currentWindow = null;
        void params.onWindowEnded();
      }
    }, delay);
  };

  const setWindow = (window: ClaudeUnifiedProviderUnavailablePromptDeliveryWindow | null): void => {
    if (isDisposed) return;
    if (window === null) {
      if (currentWindow !== null || activeTimer !== null) {
        clearActiveTimer();
        currentWindow = null;
        void params.onWindowEnded();
      }
      return;
    }

    clearActiveTimer();
    currentWindow = window;
    scheduleTimerForWindow(window);
  };

  const isActive = (nowMs?: number, currentModelId?: string | null): boolean => {
    if (isDisposed || currentWindow === null) return false;
    const now = nowMs ?? (params.nowMs?.() ?? Date.now());
    if (!isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(currentWindow, now, currentModelId)) {
      setWindow(null);
      return false;
    }
    return true;
  };

  const dispose = (): void => {
    isDisposed = true;
    clearActiveTimer();
    currentWindow = null;
  };

  return {
    getWindow: () => currentWindow,
    setWindow,
    isActive,
    dispose,
  };
}

function readUserMessageLocalIds(error: unknown): string[] {
  const raw = (error as { userMessageLocalIds?: unknown }).userMessageLocalIds;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const localIds: string[] = [];
  for (const value of raw) {
    const localId = readPendingLocalId(value) ?? '';
    if (!localId || seen.has(localId)) continue;
    seen.add(localId);
    localIds.push(localId);
  }
  return localIds;
}

function normalizeLocalIds(localIds: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of localIds ?? []) {
    const localId = readPendingLocalId(value) ?? '';
    if (!localId || seen.has(localId)) continue;
    seen.add(localId);
    normalized.push(localId);
  }
  return normalized;
}

export function resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker(params: Readonly<{
  localIds: readonly string[] | null | undefined;
  blocker: ClaudeUnifiedDeliveryBlocker | null | undefined;
}>): ClaudeUnifiedPendingDeliveryBlock | null {
  const localIds = normalizeLocalIds(params.localIds);
  if (localIds.length === 0 || !params.blocker) return null;

  if (
    params.blocker.kind === 'terminal_user_draft'
    || params.blocker.kind === 'own_leftover_clear_failed'
    || params.blocker.kind === 'capture_ambiguous'
  ) {
    return {
      localIds,
      reason: 'terminal_composer_draft',
    };
  }

  if (params.blocker.kind === 'provider_unavailable') {
    return {
      localIds,
      reason: 'provider_unavailable_before_acceptance',
    };
  }

  if (params.blocker.kind === 'runtime_config_blocked') {
    return {
      localIds,
      reason: 'runtime_config_blocked',
    };
  }

  if (
    params.blocker.kind === 'terminal_busy'
    && isClaudeUnifiedDialogBlockedReason(params.blocker.detail)
  ) {
    return {
      localIds,
      reason: 'runtime_config_blocked',
    };
  }

  return null;
}

export function resolveClaudeUnifiedPendingDeliveryBlock(
  error: unknown,
): ClaudeUnifiedPendingDeliveryBlock | null {
  if (!isClaudeUnifiedTerminalInjectionFailureError(error)) return null;

  const localIds = readUserMessageLocalIds(error);
  if (localIds.length === 0) return null;

  if (
    (error as { failureState?: unknown }).failureState === 'failed_terminal'
    && (error as { reason?: unknown }).reason === 'payload_too_large'
    && (error as { phase?: unknown }).phase === 'before_write'
    && (error as { duplicateRisk?: unknown }).duplicateRisk === 'none'
  ) {
    return {
      localIds,
      reason: 'payload_too_large',
    };
  }

  const failureState = (error as { failureState?: unknown }).failureState;
  const reason = (error as { reason?: unknown }).reason;
  const phase = (error as { phase?: unknown }).phase;
  const duplicateRisk = (error as { duplicateRisk?: unknown }).duplicateRisk;
  const recoverable = (error as { recoverable?: unknown }).recoverable;
  const pendingProviderAction = (error as { pendingProviderAction?: unknown }).pendingProviderAction;

  if (
    (failureState === 'failed_terminal' || failureState === 'failed_ambiguous')
    && pendingProviderAction === 'steer'
    && reason === 'no_target'
    && phase === 'before_write'
    && duplicateRisk === 'none'
    && recoverable === false
  ) {
    return {
      localIds,
      reason: 'steering_unavailable',
      providerEffect: 'none',
    };
  }

  if (
    failureState === 'failed_ambiguous'
    && (reason === 'host_unreachable' || reason === 'verification_failed')
    && phase === 'after_enter_unknown'
    && duplicateRisk !== 'none'
    && recoverable === true
  ) {
    return {
      localIds,
      reason: 'ambiguous_terminal_delivery',
    };
  }

  if (
    failureState === 'failed_ambiguous'
    && (reason === 'timeout' || reason === 'verification_failed')
    && (phase === 'during_write' || phase === 'after_write_before_enter')
    && duplicateRisk !== 'none'
    && recoverable === true
  ) {
    return {
      localIds,
      reason: 'delivery_outcome_uncertain',
    };
  }

  if (
    failureState === 'failed_terminal'
    && reason === 'host_unreachable'
    && phase === 'after_write_before_enter'
    && duplicateRisk !== 'none'
    && recoverable === true
  ) {
    return {
      localIds,
      reason: 'terminal_host_unreachable',
    };
  }

  return null;
}
