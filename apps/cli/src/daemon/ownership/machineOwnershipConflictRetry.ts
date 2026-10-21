import type { DaemonStartupSource } from '@/daemon/ownership/daemonOwnershipMetadata';

const INITIAL_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;
const JITTER_RATIO = 0.2;

/**
 * Whether a server-side machine ownership conflict should be retried instead of shutting down.
 *
 * An unattended daemon (service, self-restart, installer) often reconnects while the server still
 * holds the previous process's socket until ping timeout. Exiting there leaves the machine offline
 * with nobody to restart it, so only a manually started daemon yields immediately.
 */
export function shouldRetryMachineOwnershipConflict(startupSource: DaemonStartupSource): boolean {
  return startupSource !== 'manual';
}

export function createMachineOwnershipConflictBackoff(params: Readonly<{ random?: () => number }> = {}) {
  const random = params.random ?? Math.random;
  let attempt = 0;
  return {
    nextDelayMs(): number {
      const base = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** attempt);
      attempt += 1;
      const jitter = 1 - JITTER_RATIO + 2 * JITTER_RATIO * random();
      return Math.min(MAX_DELAY_MS, Math.round(base * jitter));
    },
    reset(): void {
      attempt = 0;
    },
  };
}
