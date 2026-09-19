import { access } from 'node:fs/promises';

import {
  readDefaultManagedReleaseChannel,
  resolveDesiredShimTargets,
  resolveInstalledFirstPartyComponentPaths,
} from '@happier-dev/cli-common/firstPartyRuntime';
import type { PublicReleaseRingId } from '@happier-dev/release-runtime/releaseRings';

import { buildMissingJavaScriptRuntimeMessage } from '@/runtime/js/buildMissingJavaScriptRuntimeMessage';
import { ensureJavaScriptRuntimeExecutable } from '@/runtime/js/ensureJavaScriptRuntimeExecutable';

import type { DaemonServiceTargetMode } from './plan';
import { resolveDaemonServiceRuntimeTarget } from './runtimeTarget';

async function resolveManagedReleaseChannelShimPath(params: Readonly<{
  channel: PublicReleaseRingId;
  processEnv: NodeJS.ProcessEnv;
}>): Promise<string | null> {
  const desiredTargets = await resolveDesiredShimTargets({
    componentId: 'happier-daemon',
    channel: params.channel,
    processEnv: params.processEnv,
  });
  const fallbackShimPaths = resolveInstalledFirstPartyComponentPaths({
    componentId: 'happier-daemon',
    channel: params.channel,
    processEnv: params.processEnv,
  }).shimPaths;
  const candidateShimPaths = [
    ...desiredTargets.map((t) => t.shimPath),
    ...fallbackShimPaths,
  ];

  for (const shimPath of candidateShimPaths) {
    if (!shimPath) continue;
    try {
      await access(shimPath);
      return shimPath;
    } catch {
      // probe next candidate
    }
  }

  return null;
}

async function resolveDefaultFollowingManagedShimPath(processEnv: NodeJS.ProcessEnv): Promise<string | null> {
  const defaultReleaseChannel = await readDefaultManagedReleaseChannel({ processEnv });
  return await resolveManagedReleaseChannelShimPath({
    channel: defaultReleaseChannel,
    processEnv,
  });
}

export async function resolveDaemonServiceInstallRuntimeTarget(options: Readonly<{
  currentExecPath?: string | null;
  explicitNodePath?: string | null;
  explicitEntryPath?: string | null;
  allowBootstrap?: boolean;
  targetMode?: DaemonServiceTargetMode;
  channel?: PublicReleaseRingId | null;
  processEnv?: NodeJS.ProcessEnv;
}> = {}): Promise<Readonly<{
  nodePath: string;
  entryPath: string;
}>> {
  const currentExecPath = options.currentExecPath ?? process.execPath;
  const explicitNodePath = String(options.explicitNodePath ?? '').trim();
  const explicitEntryPath = String(options.explicitEntryPath ?? '').trim();
  const allowBootstrap = options.allowBootstrap ?? true;
  const targetMode: DaemonServiceTargetMode = options.targetMode ?? 'pinned';
  const processEnv = options.processEnv ?? process.env;

  if (!explicitNodePath && !explicitEntryPath && targetMode === 'default-following') {
    const managedDefaultShimPath = await resolveDefaultFollowingManagedShimPath(processEnv);
    if (managedDefaultShimPath) {
      return resolveDaemonServiceRuntimeTarget({
        currentExecPath,
        explicitNodePath: managedDefaultShimPath,
      });
    }
  }

  if (!explicitNodePath && !explicitEntryPath && targetMode === 'pinned' && options.channel) {
    const managedChannelShimPath = await resolveManagedReleaseChannelShimPath({
      channel: options.channel,
      processEnv,
    });
    if (managedChannelShimPath) {
      return resolveDaemonServiceRuntimeTarget({
        currentExecPath,
        explicitNodePath: managedChannelShimPath,
      });
    }
  }

  if (!allowBootstrap && !explicitNodePath && !explicitEntryPath) {
    throw new ReferenceError('Daemon service runtime bootstrap is disabled for this resolution');
  }

  const runtimeExecutable = explicitNodePath
    ? null
    : await ensureJavaScriptRuntimeExecutable({
        isBunRuntime: false,
        currentExecPath,
        processEnv,
    });

  if (!explicitNodePath && !runtimeExecutable && !explicitEntryPath) {
    throw new ReferenceError(buildMissingJavaScriptRuntimeMessage('Daemon service installation'));
  }

  return resolveDaemonServiceRuntimeTarget({
    currentExecPath,
    runtimeExecutable,
    explicitNodePath,
    explicitEntryPath,
  });
}
