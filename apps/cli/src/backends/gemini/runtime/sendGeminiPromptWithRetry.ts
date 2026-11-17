import {
  type AcpBackend,
  AcpPromptSubmissionPhaseError,
  type AcpPromptSubmissionEvidence,
} from '@/agent/acp/AcpBackend';
import type { AcpTurnOutcome } from '@/agent/acp/backend/turn/_types';
import type { ApiSessionClient } from '@/api/session/sessionClient';
import { MessageBuffer } from '@/ui/ink/messageBuffer';

export type GeminiPromptBackend =
  Pick<AcpBackend, 'sendPromptWithEvidence'>
  & Readonly<{
    waitForResponseComplete?: (timeoutMs?: number | null) => Promise<AcpTurnOutcome | void>;
  }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAcpTurnOutcome(value: unknown): value is AcpTurnOutcome {
  if (!isRecord(value)) return false;
  return (
    value.kind === 'completed' ||
    value.kind === 'aborted' ||
    value.kind === 'refused' ||
    value.kind === 'failed' ||
    value.kind === 'timed_out'
  );
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorCode(error: unknown): unknown {
  return isRecord(error) ? error.code : null;
}

function getErrorDetails(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (!isRecord(error)) return '';
  const data = isRecord(error.data) ? error.data : null;
  const details = data?.details ?? error.details ?? error.message;
  return typeof details === 'string' ? details : '';
}

export async function sendGeminiPromptWithRetry(params: {
  backend: GeminiPromptBackend;
  acpSessionId: string;
  prompt: string;
  messageBuffer: MessageBuffer;
  session: ApiSessionClient;
  onDebug: (message: string) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  waitForResponseTimeoutMs?: number;
  onProviderPromptAccepted?: () => void;
  onProviderPromptAttemptStarted?: () => void;
  onProviderPromptEffectMayHaveOccurred?: () => void;
  beforeProviderPromptAttempt?: () => void | Promise<void>;
}): Promise<AcpTurnOutcome | void> {
  // 2026-11-17: default lowered from 3 to 2 attempts — one retry, not three.
  // Each attempt re-sends the prompt to the provider; retry storms multiplied both
  // the wait (2s backoff + up to 120s response timeout per attempt) and the bill.
  const maxRetries = typeof params.maxRetries === 'number' ? params.maxRetries : 2;
  const retryDelayMs = typeof params.retryDelayMs === 'number' ? params.retryDelayMs : 2_000;
  const waitForResponseTimeoutMs: number | null = typeof params.waitForResponseTimeoutMs === 'number'
    ? params.waitForResponseTimeoutMs
    : null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let providerPromptAccepted = false;
    let providerPromptAttemptStarted = false;
    try {
      await params.beforeProviderPromptAttempt?.();
      let submissionEvidence: AcpPromptSubmissionEvidence | null = null;
      try {
        submissionEvidence = await params.backend.sendPromptWithEvidence(
          params.acpSessionId,
          params.prompt,
        );
        providerPromptAttemptStarted = true;
        params.onProviderPromptAttemptStarted?.();
      } catch (error) {
        if (
          !(error instanceof AcpPromptSubmissionPhaseError)
          || error.phase !== 'rejected_before_effect'
        ) {
          providerPromptAttemptStarted = true;
          params.onProviderPromptAttemptStarted?.();
        }
        throw error;
      }

      let responseCompletion: Promise<AcpTurnOutcome | void> | null = null;
      if (params.backend.waitForResponseComplete) {
        responseCompletion = params.backend.waitForResponseComplete(waitForResponseTimeoutMs);
      }
      if (submissionEvidence?.kind === 'effect_may_have_occurred') {
        const responseCompletionFailure = responseCompletion
          ? responseCompletion.then(
              () => new Promise<never>(() => {}),
              (error: unknown) => Promise.reject(error),
            )
          : new Promise<never>(() => {});
        await Promise.race([
          submissionEvidence.finalResponseEvidence,
          responseCompletionFailure,
        ]);
      }

      providerPromptAccepted = true;
      params.onProviderPromptAccepted?.();
      params.onDebug('[gemini] Prompt sent successfully');

      // Wait for Gemini to finish responding (all chunks received + final idle)
      // This ensures we don't send task_complete until response is truly done.
      if (responseCompletion) {
        const outcome = await responseCompletion;
        params.onDebug('[gemini] Response complete');
        return isAcpTurnOutcome(outcome) ? outcome : undefined;
      }

      return undefined;
    } catch (promptError) {
      if (providerPromptAccepted) {
        throw promptError;
      }

      lastError = promptError;
      const errorDetails = getErrorDetails(promptError);
      const errorCode = getErrorCode(promptError);

      // Quota/capacity errors are not retryable.
      const isQuotaError = errorDetails.includes('exhausted') ||
        errorDetails.includes('quota') ||
        errorDetails.includes('capacity');
      if (isQuotaError) {
        const resetTimeMatch = errorDetails.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
        let resetTimeMsg = '';
        if (resetTimeMatch) {
          const parts = resetTimeMatch.slice(1).filter(Boolean).join('');
          resetTimeMsg = ` Quota resets in ${parts}.`;
        }
        const quotaMsg = `Gemini quota exceeded.${resetTimeMsg} Try using a different model (gemini-2.5-flash-lite) or wait for quota reset.`;
        params.messageBuffer.addMessage(quotaMsg, 'status');
        params.session.sendAgentMessage('gemini', { type: 'message', message: quotaMsg });
        if (providerPromptAttemptStarted) {
          params.onProviderPromptEffectMayHaveOccurred?.();
        }
        throw promptError;
      }

      // Once session/prompt has been invoked, a rejected/lost response cannot prove that the
      // provider performed no work. Blindly retrying here can duplicate the exact Queue input.
      if (providerPromptAttemptStarted) {
        params.onProviderPromptEffectMayHaveOccurred?.();
        throw promptError;
      }

      // Retry transient internal/empty-response failures.
      const isEmptyResponseError = errorDetails.includes('empty response') ||
        errorDetails.includes('Model stream ended');
      const isInternalError = errorCode === -32603;
      const isStallTimeout =
        /Timeout waiting for response to complete/i.test(errorDetails) ||
        /turn inactivity timeout/i.test(errorDetails);
      const isRetryable = !isAbortLikeError(promptError) && (
        isEmptyResponseError ||
        isInternalError ||
        isStallTimeout
      );

      if (isRetryable && attempt < maxRetries) {
        params.onDebug(`[gemini] Retryable error on attempt ${attempt}/${maxRetries}: ${errorDetails}`);
        params.messageBuffer.addMessage(`Gemini returned empty response, retrying (${attempt}/${maxRetries})...`, 'status');
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        continue;
      }

      throw promptError;
    }
  }

  if (lastError && maxRetries > 1) {
    // If we had transient failures but eventually succeeded.
    params.onDebug('[gemini] Prompt succeeded after retries');
  }
}
