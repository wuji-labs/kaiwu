import { createHash } from 'node:crypto';

import {
  readPendingLocalId,
  type SessionContinuationResumePromptModeV1,
} from '@happier-dev/protocol';
import type { Credentials } from '@/persistence';
import { sendSessionMessage } from '@/session/services/sendSessionMessage';
import { logger } from '@/ui/logger';

import { buildContinuationResumePrompt } from './continuationResumePrompt';
import type { ConnectedServiceRuntimeAuthFailureKind } from '../runtimeAuth/types';

const DEFAULT_INFRASTRUCTURE_CONTINUATION_MAX_ATTEMPTS = 3;
const DEFAULT_USAGE_LIMIT_CONTINUATION_MAX_ATTEMPTS = 5;
const CONTINUATION_BACKOFF_MS = [30_000, 120_000, 600_000] as const;

type ContinuationRecoveryTrack = 'infrastructure' | 'usage_limit';

type ContinuationCircuitState = Readonly<{
  interruptedOriginId: string;
  attemptCount: number;
  nextAllowedAtMs: number;
  open: boolean;
}>;

type ContinuationCircuitOpenEvent = Readonly<{
  sessionId: string;
  interruptedOriginId: string;
  track: ContinuationRecoveryTrack;
  attemptCount: number;
}>;

type ContinuationCircuitRegistry = Map<string, Map<ContinuationRecoveryTrack, ContinuationCircuitState>>;

const continuationCircuitRegistry: ContinuationCircuitRegistry = new Map();

function resolveContinuationRecoveryTrack(
  recoveryKind: ConnectedServiceRuntimeAuthFailureKind | null | undefined,
): ContinuationRecoveryTrack {
  return recoveryKind === 'usage_limit' ? 'usage_limit' : 'infrastructure';
}

function resolveContinuationMaxAttempts(track: ContinuationRecoveryTrack): number {
  return track === 'usage_limit'
    ? DEFAULT_USAGE_LIMIT_CONTINUATION_MAX_ATTEMPTS
    : DEFAULT_INFRASTRUCTURE_CONTINUATION_MAX_ATTEMPTS;
}

function resolveContinuationBackoffMs(attemptCount: number): number {
  return CONTINUATION_BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), CONTINUATION_BACKOFF_MS.length - 1)] ?? 0;
}

function sleepForContinuationBackoff(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export type ConnectedServiceContinuationInterruption =
  | 'none'
  | 'clean_boundary'
  | 'forced_turn_cancelled'
  | 'provider_failed_turn';

type ConnectedServiceContinuationMessageDispatcherDeps = Readonly<{
  credentials: Credentials;
  sendMessage?: typeof sendSessionMessage;
  nowMs?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onCircuitOpen?: (event: ContinuationCircuitOpenEvent) => void;
}>;

function createContinuationLocalId(sessionId: string, attemptId: string, interruptedOriginId: string): string {
  if (!sessionId.trim() || !attemptId.trim() || !interruptedOriginId.trim()) {
    throw new Error('connected_service_continuation_identity_invalid');
  }
  const digest = createHash('sha256')
    .update(JSON.stringify([sessionId, attemptId, interruptedOriginId]))
    .digest('hex')
    .slice(0, 32);
  const localId = `connected-service-continuation:${digest}`;
  const validated = readPendingLocalId(localId);
  if (validated === null) {
    throw new Error('connected_service_continuation_local_id_invalid');
  }
  return validated;
}

export function createConnectedServiceContinuationMessageDispatcher(
  deps: ConnectedServiceContinuationMessageDispatcherDeps,
) {
  const sendMessage = deps.sendMessage ?? sendSessionMessage;
  const nowMs = deps.nowMs ?? Date.now;
  const sleep = deps.sleep ?? sleepForContinuationBackoff;
  const onCircuitOpen = deps.onCircuitOpen ?? ((event: ContinuationCircuitOpenEvent) => {
    logger.warn('[DAEMON RUN] Automatic continuation circuit opened; manual recovery is required', event);
  });

  function getTrackState(
    sessionId: string,
    track: ContinuationRecoveryTrack,
  ): ContinuationCircuitState | null {
    return continuationCircuitRegistry.get(sessionId)?.get(track) ?? null;
  }

  function setTrackState(
    sessionId: string,
    track: ContinuationRecoveryTrack,
    state: ContinuationCircuitState,
  ): void {
    const stateByTrack = continuationCircuitRegistry.get(sessionId) ?? new Map();
    stateByTrack.set(track, state);
    continuationCircuitRegistry.set(sessionId, stateByTrack);
  }

  function resetTrackState(sessionId: string, track: ContinuationRecoveryTrack): void {
    const stateByTrack = continuationCircuitRegistry.get(sessionId);
    if (!stateByTrack) return;
    stateByTrack.delete(track);
    if (stateByTrack.size === 0) continuationCircuitRegistry.delete(sessionId);
  }

  async function reserveContinuation(input: Readonly<{
    sessionId: string;
    interruptedOriginId: string;
    track: ContinuationRecoveryTrack;
  }>): Promise<Readonly<{ allowed: true; delayMs: number }> | Readonly<{ allowed: false }>> {
    const previous = getTrackState(input.sessionId, input.track);
    const current = previous?.interruptedOriginId === input.interruptedOriginId
      ? previous
      : null;
    const attemptCount = current?.attemptCount ?? 0;
    const maxAttempts = resolveContinuationMaxAttempts(input.track);
    if (current?.open === true || attemptCount >= maxAttempts) {
      if (!current?.open) {
        const opened: ContinuationCircuitState = {
          interruptedOriginId: input.interruptedOriginId,
          attemptCount,
          nextAllowedAtMs: current?.nextAllowedAtMs ?? nowMs(),
          open: true,
        };
        setTrackState(input.sessionId, input.track, opened);
        onCircuitOpen({
          sessionId: input.sessionId,
          interruptedOriginId: input.interruptedOriginId,
          track: input.track,
          attemptCount,
        });
      }
      return { allowed: false };
    }

    const now = nowMs();
    const scheduledAtMs = Math.max(now, current?.nextAllowedAtMs ?? now);
    const nextAttemptCount = attemptCount + 1;
    setTrackState(input.sessionId, input.track, {
      interruptedOriginId: input.interruptedOriginId,
      attemptCount: nextAttemptCount,
      nextAllowedAtMs: scheduledAtMs + resolveContinuationBackoffMs(nextAttemptCount),
      open: false,
    });
    return { allowed: true, delayMs: Math.max(0, scheduledAtMs - now) };
  }

  return {
    async sendContinuationPrompt(input: Readonly<{
      sessionId: string;
      prompt: string;
      localId: string;
    }>): Promise<Readonly<{ suppressed: boolean }>> {
      const sent = await sendMessage({
        credentials: deps.credentials,
        idOrPrefix: input.sessionId,
        message: input.prompt,
        localId: input.localId,
        requestedAction: { v: 1, kind: 'send_now' },
        pendingAdmissionMode: 'continuation_if_no_queued_user_input',
        resumeInactiveSession: false,
        wait: false,
        timeoutMs: 1,
      });
      if (!sent.ok) {
        throw new Error(`continuation_prompt_send_failed:${sent.code}`);
      }
      return { suppressed: sent.suppressed === true };
    },

    async enqueueInterruptedOriginContinuation(input: Readonly<{
      sessionId: string;
      attemptId: string;
      interruptedOriginId: string;
      interruption: ConnectedServiceContinuationInterruption;
      resumePromptMode: SessionContinuationResumePromptModeV1;
      customResumePrompt?: string | null;
      recoveryKind?: ConnectedServiceRuntimeAuthFailureKind | null;
    }>): Promise<
      | Readonly<{ status: 'not_interrupted' | 'disabled' | 'suppressed_newer_user_input' }>
      | Readonly<{ status: 'enqueued'; localId: string }>
      | Readonly<{ status: 'circuit_open' }>
    > {
      if (input.interruption === 'none' || input.interruption === 'clean_boundary') {
        return { status: 'not_interrupted' };
      }
      if (input.resumePromptMode === 'off') {
        return { status: 'disabled' };
      }
      const track = resolveContinuationRecoveryTrack(input.recoveryKind);
      const reservation = await reserveContinuation({
        sessionId: input.sessionId,
        interruptedOriginId: input.interruptedOriginId,
        track,
      });
      if (!reservation.allowed) return { status: 'circuit_open' };
      if (reservation.delayMs > 0) await sleep(reservation.delayMs);
      const prompt = buildContinuationResumePrompt({
        resumePromptMode: input.resumePromptMode,
        customResumePrompt: input.customResumePrompt,
        recoveryKind: input.recoveryKind,
      });
      const localId = createContinuationLocalId(input.sessionId, input.attemptId, input.interruptedOriginId);
      const sent = await this.sendContinuationPrompt({ sessionId: input.sessionId, prompt, localId });
      if (sent.suppressed) {
        resetTrackState(input.sessionId, track);
        return { status: 'suppressed_newer_user_input' };
      }
      return { status: 'enqueued', localId };
    },
  };
}
