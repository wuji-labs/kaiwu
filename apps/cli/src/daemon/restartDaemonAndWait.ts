import {
  inspectDaemonRunningStateAndCleanupStaleState,
  restartAllDaemonSessionRunners,
  stopDaemon,
} from '@/daemon/controlClient';
import type {
  DaemonSessionRunnerRestartMode,
  RestartAllDaemonSessionRunnersResult,
} from '@/daemon/controlClient';
import { spawnDetachedDaemonStartSync } from '@/daemon/runtime/spawnDetachedDaemonStartSync';
import {
  readDaemonStartWaitPollMs,
  readDaemonStartWaitTimeoutMs,
} from '@/daemon/startupWaitDefaults';
import { waitForDaemonRunningWithinBudget } from '@/daemon/waitForDaemonRunningWithinBudget';
import { readPositiveIntEnv } from '@/utils/readPositiveIntEnv';
import { isPidAliveBySignal } from '@/daemon/processRunState';

const DEFAULT_DAEMON_RESTART_STABILITY_TIMEOUT_MS = 2_000;

type DaemonRunningInspection = Awaited<ReturnType<typeof inspectDaemonRunningStateAndCleanupStaleState>>;

type DaemonIdentityFingerprint = Readonly<{
  pid: number | null;
  stableKey: string | null;
}>;

function resolveDaemonIdentityFingerprint(
  inspection: DaemonRunningInspection,
): DaemonIdentityFingerprint | null {
  if ('state' in inspection) {
    const { state } = inspection;
    return {
      pid: Number.isFinite(state.pid) ? state.pid : null,
      stableKey: [
        state.pid,
        state.startedAt ?? '',
        state.httpPort ?? '',
        state.controlToken ?? '',
        state.startedWithCliVersion ?? '',
        state.startedWithPublicReleaseChannel ?? '',
      ].join('|'),
    };
  }

  if (inspection.status === 'starting' && 'pid' in inspection) {
    return {
      pid: inspection.pid,
      stableKey: null,
    };
  }

  return null;
}

function isSameDaemonIdentity(
  previousIdentityFingerprint: DaemonIdentityFingerprint,
  currentIdentityFingerprint: DaemonIdentityFingerprint,
): boolean {
  if (previousIdentityFingerprint.stableKey && currentIdentityFingerprint.stableKey) {
    return previousIdentityFingerprint.stableKey === currentIdentityFingerprint.stableKey;
  }
  return previousIdentityFingerprint.pid !== null
    && currentIdentityFingerprint.pid !== null
    && previousIdentityFingerprint.pid === currentIdentityFingerprint.pid;
}

export type RestartDaemonAndWaitParams = Readonly<{
  stopSessions?: boolean;
  takeover?: boolean;
  restartSessionRunners?: boolean;
  restartSessionRunnersMode?: DaemonSessionRunnerRestartMode;
}>;

export type RestartDaemonAndWaitResult = Readonly<{
  ok: boolean;
  status?: 'starting';
  sessionRunnerRestart?: RestartAllDaemonSessionRunnersResult;
}>;

function restartFailed(): RestartDaemonAndWaitResult {
  return { ok: false };
}

const isPidAlive = isPidAliveBySignal;

function isStartingInspectionForNewDaemon(
  inspection: DaemonRunningInspection,
  previousIdentityFingerprint: DaemonIdentityFingerprint | null,
): boolean {
  if (inspection.status !== 'starting') return false;
  const currentIdentityFingerprint = resolveDaemonIdentityFingerprint(inspection);
  if (!currentIdentityFingerprint) return true;
  return !previousIdentityFingerprint
    || !isSameDaemonIdentity(previousIdentityFingerprint, currentIdentityFingerprint);
}

function resolveRestartedDaemonFinalProofIdentity(
  inspection: DaemonRunningInspection,
  previousIdentityFingerprint: DaemonIdentityFingerprint | null,
): DaemonIdentityFingerprint | null {
  if (inspection.status !== 'running') {
    return null;
  }

  const currentIdentityFingerprint = resolveDaemonIdentityFingerprint(inspection);
  if (!currentIdentityFingerprint) {
    return null;
  }

  if (
    previousIdentityFingerprint
    && isSameDaemonIdentity(previousIdentityFingerprint, currentIdentityFingerprint)
  ) {
    return null;
  }

  return currentIdentityFingerprint;
}

export async function restartDaemonAndWait(params: RestartDaemonAndWaitParams = {}): Promise<RestartDaemonAndWaitResult> {
  const previousDaemon = await inspectDaemonRunningStateAndCleanupStaleState();
  const previousIdentityFingerprint = resolveDaemonIdentityFingerprint(previousDaemon);

  try {
    await stopDaemon({ stopSessions: params.stopSessions });
  } catch {
    // best-effort; restart should still attempt to start even if the daemon wasn't running
  }

  const child = await spawnDetachedDaemonStartSync({
    startupSource: 'self-restart',
    ...(params.takeover === false
      ? null
      : {
        env: {
          ...process.env,
          HAPPIER_DAEMON_TAKEOVER: '1',
        },
      }),
  });
  child.unref();

  const timeoutMs = readDaemonStartWaitTimeoutMs();
  const pollMs = readDaemonStartWaitPollMs();
  let provenIdentityFingerprint: DaemonIdentityFingerprint | null = null;
  const hasFinalProof = await waitForDaemonRunningWithinBudget({
    isRunning: async () => {
      const inspection = await inspectDaemonRunningStateAndCleanupStaleState();
      const proofIdentityFingerprint = resolveRestartedDaemonFinalProofIdentity(
        inspection,
        previousIdentityFingerprint,
      );
      if (!proofIdentityFingerprint) {
        return false;
      }
      provenIdentityFingerprint = proofIdentityFingerprint;
      return true;
    },
    timeoutMs,
    pollMs,
  });
  if (!hasFinalProof || !provenIdentityFingerprint) {
    const postTimeoutInspection = await inspectDaemonRunningStateAndCleanupStaleState().catch(() => null);
    if (
      (postTimeoutInspection && isStartingInspectionForNewDaemon(postTimeoutInspection, previousIdentityFingerprint))
      || isPidAlive(child.pid)
    ) {
      return {
        ok: true,
        status: 'starting',
      };
    }
    return restartFailed();
  }

  const stabilityTimeoutMs = readPositiveIntEnv(
    'HAPPIER_DAEMON_RESTART_STABILITY_TIMEOUT_MS',
    DEFAULT_DAEMON_RESTART_STABILITY_TIMEOUT_MS,
  );
  if (stabilityTimeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, stabilityTimeoutMs)));
  }

  const stableInspection = await inspectDaemonRunningStateAndCleanupStaleState();
  const stableIdentityFingerprint = resolveRestartedDaemonFinalProofIdentity(
    stableInspection,
    previousIdentityFingerprint,
  );
  if (
    !stableIdentityFingerprint
    || !isSameDaemonIdentity(provenIdentityFingerprint, stableIdentityFingerprint)
  ) {
    return restartFailed();
  }

  let sessionRunnerRestart: RestartAllDaemonSessionRunnersResult | undefined;
  if (params.restartSessionRunners === true) {
    try {
      sessionRunnerRestart = await restartAllDaemonSessionRunners({
        mode: params.restartSessionRunnersMode ?? 'force_current_cli',
        dryRun: false,
        reason: 'daemon_restart_session_runners',
      });
    } catch {
      return restartFailed();
    }
    if (!sessionRunnerRestart.ok || sessionRunnerRestart.failedCount > 0) {
      return {
        ok: false,
        sessionRunnerRestart,
      };
    }
  }

  return {
    ok: true,
    ...(sessionRunnerRestart ? { sessionRunnerRestart } : {}),
  };
}
