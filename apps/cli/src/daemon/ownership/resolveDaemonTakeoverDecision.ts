import type { DaemonStartupSource } from '@/daemon/ownership/daemonOwnershipMetadata';
import type { CurrentDaemonOwner, DaemonOwnerEvaluation } from '@/daemon/ownership/evaluateCurrentDaemonOwner';

export type DaemonTakeoverDecision =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'conflict'; owner: CurrentDaemonOwner }>
  | Readonly<{ kind: 'manual-owner-takeover'; owner: CurrentDaemonOwner }>
  | Readonly<{ kind: 'manual-owner-replace'; owner: CurrentDaemonOwner }>;

function canImplicitlyReplaceConflictingManualOwner(
  owner: CurrentDaemonOwner,
  startupSource: DaemonStartupSource,
): boolean {
  if (owner.source === 'process') {
    return false;
  }
  if (startupSource !== 'manual' && startupSource !== 'self-restart') {
    return false;
  }
  if (owner.serviceManaged === true) {
    return false;
  }

  // Manually started daemons that only drifted by CLI version or public release channel should
  // be stopped and replaced by the newer runtime without forcing an explicit takeover flag.
  return !owner.versionMatches || !owner.releaseChannelMatches;
}

function canOverlapSelfRestartOwner(
  owner: CurrentDaemonOwner,
  startupSource: DaemonStartupSource,
  takeoverRequested: boolean,
): boolean {
  return startupSource === 'self-restart'
    && takeoverRequested
    && owner.source === 'state'
    && owner.serviceManaged !== true;
}

export function resolveDaemonTakeoverDecision(params: Readonly<{
  ownership: DaemonOwnerEvaluation;
  takeoverRequested: boolean;
  startupSource: DaemonStartupSource;
}>): DaemonTakeoverDecision {
  if (params.ownership.kind === 'none' || params.ownership.kind === 'compatible') {
    return { kind: 'ok' };
  }

  if (canOverlapSelfRestartOwner(params.ownership.owner, params.startupSource, params.takeoverRequested)) {
    return { kind: 'ok' };
  }

  if (params.takeoverRequested && params.ownership.owner.serviceManaged !== true) {
    return { kind: 'manual-owner-takeover', owner: params.ownership.owner };
  }

  if (canImplicitlyReplaceConflictingManualOwner(params.ownership.owner, params.startupSource)) {
    return { kind: 'manual-owner-replace', owner: params.ownership.owner };
  }

  return { kind: 'conflict', owner: params.ownership.owner };
}

function describeTakeoverAction(action: 'start' | 'start-sync' | 'restart'): string {
  if (action === 'start') {
    return 'start the daemon';
  }
  if (action === 'start-sync') {
    return 'start the daemon synchronously';
  }
  return 'restart the daemon';
}

export function buildDaemonTakeoverHint(params: Readonly<{
  commandPath: string;
  action: 'start' | 'start-sync' | 'restart';
}>): string {
  return `Re-run with \`${params.commandPath} ${params.action} --takeover\` if you want to stop the current manual daemon and ${describeTakeoverAction(params.action)}.`;
}

export function buildDaemonTakeoverNotice(params: Readonly<{
  action: 'start' | 'start-sync' | 'restart';
}>): Readonly<{ title: string; lines: readonly string[] }> {
  return {
    title: 'Taking over the current manual daemon.',
    lines: [
      `Kaiwu will stop the current manual daemon before it ${params.action === 'start'
        ? 'starts the daemon'
        : params.action === 'start-sync'
          ? 'starts the daemon synchronously'
          : 'restarts the daemon'}.`,
    ],
  };
}
