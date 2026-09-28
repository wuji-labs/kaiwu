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
import { probeCliVersion } from './resolveCliVersionFromBinary';

async function resolveManagedReleaseChannelShimPath(params: Readonly<{
  channel: PublicReleaseRingId;
  processEnv: NodeJS.ProcessEnv;
  expectedVersion?: string | null;
  platform?: NodeJS.Platform;
  skipProbe?: boolean;
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
      if (!params.skipProbe) {
        const probe = probeCliVersion({
          nodePath: shimPath,
          platform: params.platform,
          expectedVersion: params.expectedVersion,
          processEnv: params.processEnv,
        });
        if (!probe.ok) {
          // Reject candidate and fall back to next candidate
          continue;
        }
      }
      return shimPath;
    } catch {
      // probe next candidate
    }
  }

  return null;
}

async function resolveDefaultFollowingManagedShimPath(params: Readonly<{
  processEnv: NodeJS.ProcessEnv;
  expectedVersion?: string | null;
  platform?: NodeJS.Platform;
  skipProbe?: boolean;
}>): Promise<string | null> {
  const defaultReleaseChannel = await readDefaultManagedReleaseChannel({ processEnv: params.processEnv });
  return await resolveManagedReleaseChannelShimPath({
    channel: defaultReleaseChannel,
    processEnv: params.processEnv,
    expectedVersion: params.expectedVersion,
    platform: params.platform,
    skipProbe: params.skipProbe,
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
  expectedVersion?: string | null;
  platform?: NodeJS.Platform;
  skipProbe?: boolean;
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
  const expectedVersion = options.expectedVersion ?? null;
  const platform = options.platform ?? process.platform;
  const skipProbe = options.skipProbe ?? false;

  if (!explicitNodePath && !explicitEntryPath && targetMode === 'default-following') {
    const managedDefaultShimPath = await resolveDefaultFollowingManagedShimPath({
      processEnv,
      expectedVersion,
      platform,
      skipProbe,
    });
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
      expectedVersion,
      platform,
      skipProbe,
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

  const targetNodePath = explicitNodePath || runtimeExecutable || currentExecPath;
  const validateEntrypointCandidate = skipProbe
    ? undefined
    : (candidate: string) => {
        const probe = probeCliVersion({
          nodePath: targetNodePath,
          entryPath: candidate,
          platform,
          expectedVersion,
          processEnv,
        });
        return probe.ok;
      };

  const resolved = resolveDaemonServiceRuntimeTarget({
    currentExecPath,
    runtimeExecutable,
    explicitNodePath,
    explicitEntryPath,
    validateEntrypointCandidate,
  });

  if (!skipProbe) {
    const finalProbe = probeCliVersion({
      nodePath: resolved.nodePath,
      entryPath: resolved.entryPath || null,
      platform,
      expectedVersion,
      processEnv,
    });
    if (!finalProbe.ok) {
      throw new Error(`后台服务安装入口验明正身失败：${finalProbe.reason}`);
    }
  }

  return resolved;
}
