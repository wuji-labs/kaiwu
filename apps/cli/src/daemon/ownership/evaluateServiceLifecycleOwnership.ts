import type { CurrentDaemonOwner, DaemonOwnerEvaluation } from '@/daemon/ownership/evaluateCurrentDaemonOwner';

export type DaemonServiceLifecycleConflict =
  | Readonly<{ kind: 'unknown-owner-conflict'; owner: CurrentDaemonOwner }>
  | Readonly<{ kind: 'manual-owner-conflict'; owner: CurrentDaemonOwner }>
  | Readonly<{ kind: 'other-service-conflict'; owner: CurrentDaemonOwner }>;

export function evaluateDaemonServiceLifecycleOwnership(params: Readonly<{
  ownership: DaemonOwnerEvaluation;
  expectedServiceLabel: string;
}>): Readonly<{ kind: 'ok' }> | DaemonServiceLifecycleConflict {
  const expectedServiceLabel = params.expectedServiceLabel.trim();
  if (!expectedServiceLabel) {
    throw new Error('expectedServiceLabel is required');
  }
  if (params.ownership.kind === 'none') {
    return { kind: 'ok' };
  }

  const owner = params.ownership.owner;
  if (owner.serviceManaged === null) {
    return { kind: 'unknown-owner-conflict', owner };
  }

  if (owner.serviceManaged === false) {
    return { kind: 'manual-owner-conflict', owner };
  }

  if (owner.state.serviceLabel === expectedServiceLabel) {
    return { kind: 'ok' };
  }

  return { kind: 'other-service-conflict', owner };
}

function buildOwnerDetails(owner: CurrentDaemonOwner): string[] {
  const lines = [
    `Current release channel: ${owner.state.startedWithPublicReleaseChannel ?? 'unknown'}`,
    `Current CLI version: ${owner.state.startedWithCliVersion}`,
  ];
  if (owner.state.serviceLabel) {
    lines.push(`Current background service label: ${owner.state.serviceLabel}`);
  }
  return lines;
}

export function renderDaemonServiceLifecycleOwnershipConflict(params: Readonly<{
  action: 'install' | 'start' | 'restart';
  conflict: DaemonServiceLifecycleConflict;
}>): Readonly<{ title: string; lines: readonly string[] }> {
  const owner = params.conflict.owner;
  if (params.conflict.kind === 'unknown-owner-conflict') {
    const actionDescription = params.action === 'install'
      ? 'enable automatic startup'
      : `${params.action} the background service`;
    return {
      title: 'Kaiwu could not determine how the current daemon was started.',
      lines: [
        ...buildOwnerDetails(owner),
        `Stop the current daemon before trying to ${actionDescription}.`,
      ],
    };
  }

  if (params.conflict.kind === 'manual-owner-conflict') {
    const actionDescription = params.action === 'install'
      ? 'enable automatic startup'
      : `${params.action} the background service`;
    return {
      title: 'A manually started daemon is currently running for the selected relay.',
      lines: [
        ...buildOwnerDetails(owner),
        `Use \`happier daemon stop\` before trying to ${actionDescription}.`,
      ],
    };
  }

  const actionDescription = params.action === 'install'
    ? 'enable automatic startup for a different background service'
    : `${params.action} a different background service`;
  return {
    title: 'Another background service is currently running for the selected relay.',
    lines: [
      ...buildOwnerDetails(owner),
      `Use \`happier service stop\` or \`happier doctor repair\` before trying to ${actionDescription}.`,
    ],
  };
}

export function renderDaemonServiceStopOwnershipNote(params: Readonly<{
  ownership: DaemonOwnerEvaluation;
  expectedServiceLabel: string;
}>): Readonly<{ title: string; lines: readonly string[] }> | null {
  if (params.ownership.kind === 'none') {
    return null;
  }

  const owner = params.ownership.owner;
  if (owner.serviceManaged === true && owner.state.serviceLabel === params.expectedServiceLabel) {
    return null;
  }

  if (owner.serviceManaged === true) {
    return {
      title: 'Stopping this background service will not stop the current daemon.',
      lines: [
        ...buildOwnerDetails(owner),
        'A different background service is currently running for the selected relay.',
        'Use `happier service stop` from the currently owning installation, or run `happier service status` to inspect the active owner.',
      ],
    };
  }

  if (owner.serviceManaged === false) {
    return {
      title: 'Stopping this background service will not stop the current daemon.',
      lines: [
        ...buildOwnerDetails(owner),
        'A manually started daemon is currently running for the selected relay.',
        'Use `happier daemon stop` if you also want to stop the current daemon.',
      ],
    };
  }

  return {
    title: 'Stopping this background service will not stop the current daemon.',
    lines: [
      ...buildOwnerDetails(owner),
      'Kaiwu could not determine how the current daemon was started.',
      'Stop the current daemon separately if you also need to switch which installation is running.',
    ],
  };
}

export function renderDaemonServiceRepairOwnershipNote(params: Readonly<{
  ownership: DaemonOwnerEvaluation;
}>): Readonly<{ title: string; lines: readonly string[] }> | null {
  if (params.ownership.kind === 'none') {
    return null;
  }

  const owner = params.ownership.owner;
  if (owner.serviceManaged === true) {
    return null;
  }

  if (owner.serviceManaged === false) {
    return {
      title: 'Repairing automatic startup will not stop what is currently running.',
      lines: [
        ...buildOwnerDetails(owner),
        'A manually started daemon is currently running on this computer.',
        'Use `happier daemon stop` or `happier daemon restart` if you also need to switch the running daemon to this installation.',
      ],
    };
  }

  return {
    title: 'Repairing automatic startup will not stop what is currently running.',
    lines: [
      ...buildOwnerDetails(owner),
      'Kaiwu could not determine how the running daemon was started.',
      'Stop the running daemon separately if you also need to switch this installation immediately.',
    ],
  };
}
