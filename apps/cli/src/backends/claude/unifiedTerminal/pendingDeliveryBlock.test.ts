import { describe, expect, it, vi } from 'vitest';

import {
  CLAUDE_UNIFIED_CAPACITY_PROVIDER_UNAVAILABLE_MAX_WINDOW_MS,
  createClaudeUnifiedProviderUnavailableDeliveryWindowTracker,
  isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive,
  resolveClaudeModelScopedLimitFamily,
  resolveClaudeUnifiedPendingDeliveryBlock,
  resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker,
  resolveClaudeUnifiedProviderUnavailableUntilMs,
} from './pendingDeliveryBlock';
import { ClaudeUnifiedTerminalInjectionFailureError } from './terminalInjectionFailureError';

describe('resolveClaudeUnifiedPendingDeliveryBlock', () => {
  it('does not create pending-delivery authority from elapsed provider-acceptance time', () => {
    const error = Object.assign(new Error('Claude unified terminal prompt submission could not be confirmed'), {
      code: 'claude_unified_terminal_injection_failed',
      failureState: 'failed_ambiguous',
      reason: 'timeout',
      phase: 'after_enter_unknown',
      duplicateRisk: 'likely',
      recoverable: true,
      userMessageLocalIds: ['pending-local-timeout', 'pending-local-timeout', 'pending-local-2'],
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toBeNull();
  });

  it.each(['host_unreachable', 'verification_failed'] as const)(
    'classifies recoverable after-enter %s ambiguity as ambiguous blocked pending delivery',
    (reason) => {
      const error = Object.assign(new Error('Claude unified terminal prompt submission could not be confirmed'), {
        code: 'claude_unified_terminal_injection_failed',
        failureState: 'failed_ambiguous',
        reason,
        phase: 'after_enter_unknown',
        duplicateRisk: 'possible',
        recoverable: true,
        userMessageLocalIds: ['pending-local-visible-after-enter'],
      });

      expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toEqual({
        localIds: ['pending-local-visible-after-enter'],
        reason: 'ambiguous_terminal_delivery',
      });
    },
  );

  it('does not classify provider acceptance timeouts without pending local ids', () => {
    const error = Object.assign(new Error('Claude unified terminal prompt submission could not be confirmed'), {
      code: 'claude_unified_terminal_injection_failed',
      failureState: 'failed_ambiguous',
      reason: 'timeout',
      phase: 'after_enter_unknown',
      duplicateRisk: 'likely',
      recoverable: true,
      userMessageLocalIds: [],
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toBeNull();
  });

  it('preserves deterministic oversized prompt classification', () => {
    const error = Object.assign(new Error('Claude unified terminal prompt injection failed'), {
      code: 'claude_unified_terminal_injection_failed',
      failureState: 'failed_terminal',
      reason: 'payload_too_large',
      phase: 'before_write',
      duplicateRisk: 'none',
      recoverable: true,
      userMessageLocalIds: ['pending-local-too-large'],
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toEqual({
      localIds: ['pending-local-too-large'],
      reason: 'payload_too_large',
    });
  });

  it('classifies an exact pre-write steer with no active target as steering unavailable', () => {
    const error = new ClaudeUnifiedTerminalInjectionFailureError({
      batch: {
        message: 'steer this active turn',
        origin: { kind: 'ui_pending' },
        pendingProviderAction: 'steer',
        userMessageLocalIds: ['pending-local-steer'],
      },
      failureState: 'failed_terminal',
      result: {
        status: 'failed',
        reason: 'no_target',
        phase: 'before_write',
        duplicateRisk: 'none',
        recoverable: false,
      },
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toEqual({
      localIds: ['pending-local-steer'],
      reason: 'steering_unavailable',
      providerEffect: 'none',
    });
  });

  it.each([
    ['possible duplicate risk', { duplicateRisk: 'possible' }],
    ['after-write failure', { phase: 'after_write_before_enter' }],
    ['recoverable failure', { recoverable: true }],
    ['missing pending identity', { userMessageLocalIds: [] }],
    ['missing exact action provenance', { pendingProviderAction: undefined }],
    ['another exact action', { pendingProviderAction: 'interrupt_and_send' }],
  ])('does not reinterpret neighboring no-target failure with %s as steering unavailable', (_label, override) => {
    const error = Object.assign(new Error('Claude unified terminal steer target is unavailable'), {
      code: 'claude_unified_terminal_injection_failed',
      failureState: 'failed_terminal',
      reason: 'no_target',
      phase: 'before_write',
      duplicateRisk: 'none',
      recoverable: false,
      pendingProviderAction: 'steer',
      userMessageLocalIds: ['pending-local-steer'],
      ...override,
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toBeNull();
  });

  it('classifies host loss after writing a pending prompt as blocked pending delivery', () => {
    const error = Object.assign(new Error('Claude unified terminal prompt injection failed'), {
      code: 'claude_unified_terminal_injection_failed',
      failureState: 'failed_terminal',
      reason: 'host_unreachable',
      phase: 'after_write_before_enter',
      duplicateRisk: 'possible',
      recoverable: true,
      userMessageLocalIds: ['pending-local-host-lost'],
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toEqual({
      localIds: ['pending-local-host-lost'],
      reason: 'terminal_host_unreachable',
    });
  });

  it.each(['timeout', 'verification_failed'] as const)(
    'classifies pre-Enter %s after prompt bytes reached the composer as uncertain delivery',
    (reason) => {
      const error = Object.assign(new Error('Claude unified terminal prompt was staged but not submitted'), {
        code: 'claude_unified_terminal_injection_failed',
        failureState: 'failed_ambiguous',
        reason,
        phase: 'after_write_before_enter',
        duplicateRisk: 'possible',
        recoverable: true,
        userMessageLocalIds: ['pending-local-staged'],
      });

      expect(resolveClaudeUnifiedPendingDeliveryBlock(error)).toEqual({
        localIds: ['pending-local-staged'],
        reason: 'delivery_outcome_uncertain',
      });
    },
  );

  it('maps sustained head blockers to retryable pending delivery block reasons', () => {
    expect(resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker({
      localIds: ['pending-local-draft', ' pending-local-draft\n', 'pending-local-draft', 'pending-local-2'],
      blocker: {
        kind: 'terminal_user_draft',
        source: 'draft_guard',
        guardStatus: 'foreign_draft',
        draftLength: 12,
      },
    })).toEqual({
      localIds: ['pending-local-draft', ' pending-local-draft\n', 'pending-local-2'],
      reason: 'terminal_composer_draft',
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker({
      localIds: ['pending-local-runtime-config'],
      blocker: {
        kind: 'runtime_config_blocked',
        source: 'runtime_control',
        blockedReason: 'user_draft',
      },
    })).toEqual({
      localIds: ['pending-local-runtime-config'],
      reason: 'runtime_config_blocked',
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker({
      localIds: ['pending-local-provider-unavailable'],
      blocker: {
        kind: 'provider_unavailable',
        source: 'draft_guard',
        detail: 'claude_usage_limit_dialog',
      },
    })).toEqual({
      localIds: ['pending-local-provider-unavailable'],
      reason: 'provider_unavailable_before_acceptance',
    });

    expect(resolveClaudeUnifiedPendingDeliveryBlockForDeliveryBlocker({
      localIds: ['pending-local-dialog'],
      blocker: {
        kind: 'terminal_busy',
        source: 'readiness',
        detail: 'safeguard_pause_dialog',
      },
    })).toEqual({
      localIds: ['pending-local-dialog'],
      reason: 'runtime_config_blocked',
    });
  });
});

describe('resolveClaudeModelScopedLimitFamily', () => {
  it('extracts model family from model_limit prefix', () => {
    expect(resolveClaudeModelScopedLimitFamily({
      v: 1,
      resetAtMs: null,
      retryAfterMs: null,
      quotaScope: 'account',
      recoverability: 'wait',
      providerLimitId: 'model_limit:fable',
      planType: null,
      utilization: null,
      overage: null,
      action: null,
      connectedService: null,
    })).toBe('fable');
  });

  it('extracts model family from rate limit type containing model names like seven_day_opus', () => {
    expect(resolveClaudeModelScopedLimitFamily({
      v: 1,
      resetAtMs: null,
      retryAfterMs: null,
      quotaScope: 'account',
      recoverability: 'wait',
      providerLimitId: 'seven_day_opus',
      planType: null,
      utilization: null,
      overage: null,
      action: null,
      connectedService: null,
    })).toBe('opus');
  });

  it('returns null for generic rate limits like five_hour', () => {
    expect(resolveClaudeModelScopedLimitFamily({
      v: 1,
      resetAtMs: null,
      retryAfterMs: null,
      quotaScope: 'account',
      recoverability: 'wait',
      providerLimitId: 'five_hour',
      planType: null,
      utilization: null,
      overage: null,
      action: null,
      connectedService: null,
    })).toBeNull();
  });
});

describe('resolveClaudeUnifiedProviderUnavailableUntilMs', () => {
  it('clamps capacity window to at most 30s when resetAt is 2 hours away', () => {
    const observedAtMs = 1_000_000;
    const resetAtMs = observedAtMs + 2 * 3600 * 1000;
    const untilMs = resolveClaudeUnifiedProviderUnavailableUntilMs({
      v: 1,
      resetAtMs,
      retryAfterMs: null,
      limitCategory: 'capacity',
      quotaScope: 'account',
      recoverability: 'wait',
      providerLimitId: 'server_overloaded',
      planType: null,
      utilization: null,
      overage: null,
      action: null,
      connectedService: null,
    }, observedAtMs);

    expect(untilMs).toBe(observedAtMs + CLAUDE_UNIFIED_CAPACITY_PROVIDER_UNAVAILABLE_MAX_WINDOW_MS);
    expect(untilMs! - observedAtMs).toBe(30_000);
  });

  it('returns exactly 30s when capacity error has no future timestamps', () => {
    const observedAtMs = 1_000_000;
    const untilMs = resolveClaudeUnifiedProviderUnavailableUntilMs({
      v: 1,
      resetAtMs: null,
      retryAfterMs: null,
      limitCategory: 'capacity',
      quotaScope: 'account',
      recoverability: 'wait',
      providerLimitId: 'server_overloaded',
      planType: null,
      utilization: null,
      overage: null,
      action: null,
      connectedService: null,
    }, observedAtMs);

    expect(untilMs).toBe(observedAtMs + 30_000);
  });
});

describe('isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive', () => {
  it('deactivates model-scoped window when current model differs, activates when matching or unknown', () => {
    const nowMs = 1_000_000;
    const window = {
      unavailableUntilMs: nowMs + 60_000,
      modelFamily: 'fable',
    };

    // modelFamily=fable 加上 currentModelId=claude-opus-5-5，不激活
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs, 'claude-opus-5-5')).toBe(false);

    // 加上 claude-fable-5-1，激活
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs, 'claude-fable-5-1')).toBe(true);

    // currentModelId 为 null，激活
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs, null)).toBe(true);
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs)).toBe(true);
  });

  it('preserves existing active behavior for window without modelFamily', () => {
    const nowMs = 1_000_000;
    const window = {
      unavailableUntilMs: nowMs + 60_000,
    };

    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs, 'claude-opus-5-5')).toBe(true);
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs, null)).toBe(true);
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs)).toBe(true);

    // Expired window is not active
    expect(isClaudeUnifiedProviderUnavailablePromptDeliveryWindowActive(window, nowMs + 70_000, 'claude-opus-5-5')).toBe(false);
  });
});

describe('createClaudeUnifiedProviderUnavailableDeliveryWindowTracker', () => {
  it('triggers onWindowEnded when window expires on timer and clears window', () => {
    vi.useFakeTimers();
    try {
      let now = 100_000;
      const onWindowEnded = vi.fn();
      const tracker = createClaudeUnifiedProviderUnavailableDeliveryWindowTracker({
        onWindowEnded,
        nowMs: () => now,
      });

      tracker.setWindow({ unavailableUntilMs: now + 5_000 });
      expect(tracker.getWindow()).toEqual({ unavailableUntilMs: 105_000 });
      expect(tracker.isActive(now)).toBe(true);

      now += 4_999;
      vi.advanceTimersByTime(4_999);
      expect(onWindowEnded).not.toHaveBeenCalled();

      now += 1;
      vi.advanceTimersByTime(1);
      expect(onWindowEnded).toHaveBeenCalledTimes(1);
      expect(tracker.getWindow()).toBeNull();
      expect(tracker.isActive(now)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels previous timer when replaced with a new window', () => {
    vi.useFakeTimers();
    try {
      let now = 100_000;
      const onWindowEnded = vi.fn();
      const tracker = createClaudeUnifiedProviderUnavailableDeliveryWindowTracker({
        onWindowEnded,
        nowMs: () => now,
      });

      tracker.setWindow({ unavailableUntilMs: now + 5_000 });
      now += 2_000;
      vi.advanceTimersByTime(2_000);

      // Replace window with a longer one
      tracker.setWindow({ unavailableUntilMs: now + 10_000 });
      expect(tracker.getWindow()).toEqual({ unavailableUntilMs: 112_000 });

      // Advance past the first timer's deadline
      now += 4_000;
      vi.advanceTimersByTime(4_000);
      expect(onWindowEnded).not.toHaveBeenCalled();

      // Advance past the second timer's deadline
      now += 6_000;
      vi.advanceTimersByTime(6_000);
      expect(onWindowEnded).toHaveBeenCalledTimes(1);
      expect(tracker.getWindow()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('triggers onWindowEnded immediately when window is explicitly set to null', () => {
    vi.useFakeTimers();
    try {
      const now = 100_000;
      const onWindowEnded = vi.fn();
      const tracker = createClaudeUnifiedProviderUnavailableDeliveryWindowTracker({
        onWindowEnded,
        nowMs: () => now,
      });

      tracker.setWindow({ unavailableUntilMs: now + 5_000 });
      expect(tracker.getWindow()).not.toBeNull();

      tracker.setWindow(null);
      expect(onWindowEnded).toHaveBeenCalledTimes(1);
      expect(tracker.getWindow()).toBeNull();

      // Advancing timer does not trigger again
      vi.advanceTimersByTime(10_000);
      expect(onWindowEnded).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('triggers onWindowEnded when model mismatch deactivates window via isActive', () => {
    vi.useFakeTimers();
    try {
      const now = 100_000;
      const onWindowEnded = vi.fn();
      const tracker = createClaudeUnifiedProviderUnavailableDeliveryWindowTracker({
        onWindowEnded,
        nowMs: () => now,
      });

      tracker.setWindow({ unavailableUntilMs: now + 5_000, modelFamily: 'fable' });
      expect(tracker.getWindow()).not.toBeNull();

      // Matching model: remains active
      expect(tracker.isActive(now, 'claude-fable-5-1')).toBe(true);
      expect(onWindowEnded).not.toHaveBeenCalled();

      // Mismatched model: deactivates and triggers onWindowEnded
      expect(tracker.isActive(now, 'claude-opus-5-5')).toBe(false);
      expect(onWindowEnded).toHaveBeenCalledTimes(1);
      expect(tracker.getWindow()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not trigger onWindowEnded on expiration after dispose is called', () => {
    vi.useFakeTimers();
    try {
      const now = 100_000;
      const onWindowEnded = vi.fn();
      const tracker = createClaudeUnifiedProviderUnavailableDeliveryWindowTracker({
        onWindowEnded,
        nowMs: () => now,
      });

      tracker.setWindow({ unavailableUntilMs: now + 5_000 });
      tracker.dispose();
      expect(tracker.getWindow()).toBeNull();

      vi.advanceTimersByTime(10_000);
      expect(onWindowEnded).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
