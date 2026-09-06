import type { SessionHookData } from '../utils/startHookServer';
import { isSidechainSessionHook, readSessionHookEventName } from '../utils/sessionHookAttribution';

export class ClaudeUnifiedTerminalHookActivationError extends Error {
  readonly code = 'claude_unified_terminal_hook_activation_missing';

  constructor() {
    super(
      'Claude accepted terminal input without activating Kaiwu session hooks. '
      + 'The session was stopped because permissions and lifecycle events could not be routed safely.',
    );
    this.name = 'ClaudeUnifiedTerminalHookActivationError';
  }
}

export function isClaudeUnifiedTerminalHookActivationError(
  error: unknown,
): error is ClaudeUnifiedTerminalHookActivationError {
  return Boolean(error)
    && typeof error === 'object'
    && (error as { code?: unknown }).code === 'claude_unified_terminal_hook_activation_missing';
}

/**
 * The session-hook subscription is fed only by this runner's secret-gated hook server. A primary
 * SessionStart or UserPromptSubmit with a real session identity therefore proves the owned plugin
 * bridge is active. Sidechain and malformed payloads cannot activate the main-session boundary.
 */
export function isClaudeUnifiedTrustedHookActivationEvidence(data: SessionHookData): boolean {
  if (isSidechainSessionHook(data)) return false;
  const sessionId = data.session_id ?? data.sessionId;
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) return false;
  const hookEventName = readSessionHookEventName(data);
  return hookEventName === 'SessionStart' || hookEventName === 'UserPromptSubmit';
}

/**
 * Transcript matching remains a valid compatibility fallback when Happier did not install hooks.
 * Once Happier owns a `--plugin-dir`, however, an accepted prompt without the plugin's preceding
 * trusted main-session activation evidence proves split-brain activation: transcript mirroring may
 * work while permission hooks remain native-only. A resumed Claude process may emit UserPromptSubmit
 * for its first exact prompt without replaying SessionStart, so either owned event activates this
 * boundary. Fail at that owner boundary instead of silently degrading.
 */
export function assertClaudeUnifiedHookActivationBeforeTranscriptFallback(input: Readonly<{
  hookPluginDir: string | null | undefined;
  hookSubscriptionConfigured: boolean;
  trustedHookActivationObserved: boolean;
}>): void {
  if (!input.hookPluginDir || !input.hookSubscriptionConfigured || input.trustedHookActivationObserved) return;
  throw new ClaudeUnifiedTerminalHookActivationError();
}
