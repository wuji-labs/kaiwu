import type { PublicReleaseRingId } from '@happier-dev/release-runtime/releaseRings';
import type { DaemonServiceListEntry } from '@/daemon/service/cli';
import type { DaemonServiceMode } from '@/daemon/service/plan';
import { resolveHappierHomeDirComparableKey } from '@/daemon/ownership/happierHomeDirComparableKey';

import type { BackgroundServiceRepairAction, BackgroundServiceRepairPlan } from './types';

function isCompatibleDefaultService(params: Readonly<{
  service: DaemonServiceListEntry;
  currentReleaseChannel: PublicReleaseRingId;
}>): boolean {
  return params.service.targetMode === 'default-following' && params.service.releaseChannel === params.currentReleaseChannel;
}

function isCurrentServerPinnedService(params: Readonly<{
  service: DaemonServiceListEntry;
  currentServerId: string;
}>): boolean {
  return params.service.targetMode === 'pinned'
    && params.service.serverId === params.currentServerId;
}

function isForeignHomeService(params: Readonly<{
  service: DaemonServiceListEntry;
  currentHappierHomeDir: string | null | undefined;
}>): boolean {
  const currentHappierHomeDir = resolveHappierHomeDirComparableKey(params.currentHappierHomeDir);
  const serviceHappierHomeDir = resolveHappierHomeDirComparableKey(params.service.happierHomeDir);
  return currentHappierHomeDir !== null
    && serviceHappierHomeDir !== null
    && currentHappierHomeDir !== serviceHappierHomeDir;
}

function isSameModeDefaultFollowingService(
  service: DaemonServiceListEntry,
  preferredMode: DaemonServiceMode,
): boolean {
  return service.targetMode === 'default-following'
    && (service.mode === 'system' ? 'system' : 'user') === preferredMode;
}

function resolveServiceFilename(path: string | null | undefined): string {
  const normalizedPath = String(path ?? '').trim();
  if (!normalizedPath) {
    return '';
  }
  const segments = normalizedPath.split(/[\\/]+/);
  return segments[segments.length - 1] ?? '';
}

function isCanonicalDefaultFollowingService(service: DaemonServiceListEntry): boolean {
  if (service.targetMode !== 'default-following') {
    return false;
  }

  const label = String(service.label ?? '').trim().toLowerCase();
  if (
    label === 'happier-daemon.default'
    || label === 'com.happier.cli.daemon.default'
    || label === 'happier\\happier-daemon.default'
  ) {
    return true;
  }

  const filename = resolveServiceFilename(service.path).toLowerCase();
  return filename === 'happier-daemon.default.service'
    || filename === 'com.happier.cli.daemon.default.plist'
    || filename === 'com.happier.cli.daemon.default'
    || filename === 'happier-daemon.default.ps1';
}

function isLegacyChannelScopedDefaultService(service: DaemonServiceListEntry): boolean {
  if (service.targetMode !== 'default-following') {
    return false;
  }

  const label = String(service.label ?? '').trim().toLowerCase();
  if (label.endsWith('.default') && !isCanonicalDefaultFollowingService(service)) {
    return true;
  }

  const filename = resolveServiceFilename(service.path).toLowerCase();
  return (
    (
      filename.endsWith('.default.service')
      || filename.endsWith('.default.plist')
      || filename.endsWith('.default.ps1')
    )
    && !isCanonicalDefaultFollowingService(service)
  );
}

function compareCompatibleDefaultServicePriority(
  left: DaemonServiceListEntry,
  right: DaemonServiceListEntry,
  preferredMode: DaemonServiceMode,
): number {
  const leftPreferredMode = left.mode === preferredMode;
  const rightPreferredMode = right.mode === preferredMode;
  if (leftPreferredMode !== rightPreferredMode) {
    return leftPreferredMode ? -1 : 1;
  }

  const leftCanonical = isCanonicalDefaultFollowingService(left);
  const rightCanonical = isCanonicalDefaultFollowingService(right);
  if (leftCanonical !== rightCanonical) {
    return leftCanonical ? -1 : 1;
  }

  const leftLegacyScoped = isLegacyChannelScopedDefaultService(left);
  const rightLegacyScoped = isLegacyChannelScopedDefaultService(right);
  if (leftLegacyScoped !== rightLegacyScoped) {
    return leftLegacyScoped ? 1 : -1;
  }

  return 0;
}

export function buildBackgroundServiceRepairPlan(params: Readonly<{
  currentReleaseChannel: PublicReleaseRingId;
  currentHappierHomeDir?: string | null;
  currentServerId: string;
  preferredMode: DaemonServiceMode;
  services: readonly DaemonServiceListEntry[];
}>): BackgroundServiceRepairPlan {
  const currentHappierHomeDir = resolveHappierHomeDirComparableKey(params.currentHappierHomeDir);
  const repairableExternalDefaultServices = currentHappierHomeDir === null
    ? []
    : params.services.filter((service) =>
      isSameModeDefaultFollowingService(service, params.preferredMode)
      && (
        resolveHappierHomeDirComparableKey(service.happierHomeDir) === null
        || isForeignHomeService({
          service,
          currentHappierHomeDir: params.currentHappierHomeDir,
        })
      ),
    );
  const repairableExternalDefaultServicesSet = new Set(repairableExternalDefaultServices);
  const unknownHomeDefaultServices = params.services.filter((service) =>
    service.targetMode === 'default-following'
    && resolveHappierHomeDirComparableKey(service.happierHomeDir) === null
    && !repairableExternalDefaultServicesSet.has(service),
  );

  if (unknownHomeDefaultServices.length > 0) {
    const described = unknownHomeDefaultServices
      .map((service) => String(service.path ?? '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      currentReleaseChannel: params.currentReleaseChannel,
      existingServices: [...params.services],
      actions: [],
      manualWarnings: [
        `Detected default-following background services with missing Kaiwu home metadata (${described || 'unknown path'}). Automatic repair will not replace or remove them; remove the legacy service(s) from the owning installation first.`,
      ],
    };
  }

  const foreignHomeDefaultServices = params.services.filter((service) =>
    isForeignHomeService({
      service,
      currentHappierHomeDir: params.currentHappierHomeDir,
    })
    && service.targetMode === 'default-following'
    && service.releaseChannel === params.currentReleaseChannel,
  ).filter((service) => !repairableExternalDefaultServicesSet.has(service));
  if (foreignHomeDefaultServices.length > 0) {
    return {
      currentReleaseChannel: params.currentReleaseChannel,
      existingServices: [...params.services],
      actions: [],
      manualWarnings: [
        `Detected default-following background services from another Kaiwu home (${foreignHomeDefaultServices.map((service) => String(service.happierHomeDir ?? '').trim()).filter(Boolean).join(', ')}). Automatic repair will not replace or remove them; clean up the other installation first.`,
      ],
    };
  }

  const foreignHomePinnedCurrentServerServices = params.services.filter((service) =>
    isForeignHomeService({
      service,
      currentHappierHomeDir: params.currentHappierHomeDir,
    })
    && isCurrentServerPinnedService({
      service,
      currentServerId: params.currentServerId,
    }),
  );
  if (foreignHomePinnedCurrentServerServices.length > 0) {
    return {
      currentReleaseChannel: params.currentReleaseChannel,
      existingServices: [...params.services],
      actions: [],
      manualWarnings: [
        `Detected pinned background services for the current server from another Kaiwu home (${foreignHomePinnedCurrentServerServices.map((service) => String(service.happierHomeDir ?? '').trim()).filter(Boolean).join(', ')}). Automatic repair will not replace or remove them; clean up the other installation first.`,
      ],
    };
  }

  const scopedServices = params.services.filter((service) =>
    !repairableExternalDefaultServicesSet.has(service)
    && !isForeignHomeService({
      service,
      currentHappierHomeDir: params.currentHappierHomeDir,
    }),
  );
  const compatibleDefaultServices = scopedServices.filter((service) => isCompatibleDefaultService({
    service,
    currentReleaseChannel: params.currentReleaseChannel,
  }));
  const currentServerPinnedServices = scopedServices.filter((service) => isCurrentServerPinnedService({
    service,
    currentServerId: params.currentServerId,
  }));
  const defaultFollowingServices = scopedServices.filter((service) => service.targetMode === 'default-following');
  const compatibleDefaultService = [...compatibleDefaultServices]
    .sort((left, right) => compareCompatibleDefaultServicePriority(left, right, params.preferredMode))[0]
    ?? null;

  const compatibleDefaultServiceNeedsReinstall = compatibleDefaultService !== null
    && compatibleDefaultService.installed === true
    && compatibleDefaultService.installedDefinitionMatchesExpected === false;
  const compatibleDefaultServiceShouldBeRemoved = compatibleDefaultServiceNeedsReinstall
    && compatibleDefaultService !== null
    && !isCanonicalDefaultFollowingService(compatibleDefaultService);

  const actions: BackgroundServiceRepairAction[] = [];
  for (const service of repairableExternalDefaultServices) {
    actions.push({
      kind: 'remove-service',
      service: {
        label: service.label,
        installedPath: service.path,
        mode: service.mode === 'system' ? 'system' : 'user',
        releaseChannel: service.releaseChannel,
        targetMode: service.targetMode,
        instanceId: service.serverId,
      },
    });
  }

  const shouldRemoveOtherSameHomeServices = compatibleDefaultService !== null && currentHappierHomeDir !== null;
  const removableServices = scopedServices.filter((service) => {
    if (service === compatibleDefaultService) {
      return compatibleDefaultServiceShouldBeRemoved;
    }
    if (shouldRemoveOtherSameHomeServices) {
      const serviceHappierHomeDir = resolveHappierHomeDirComparableKey(service.happierHomeDir);
      if (serviceHappierHomeDir !== null && serviceHappierHomeDir === currentHappierHomeDir) {
        return true;
      }
    }
    if (defaultFollowingServices.includes(service)) {
      return true;
    }
    return currentServerPinnedServices.includes(service);
  });

  for (const service of removableServices) {
    actions.push({
      kind: 'remove-service',
      service: {
        label: service.label,
        installedPath: service.path,
        mode: service.mode === 'system' ? 'system' : 'user',
        releaseChannel: service.releaseChannel,
        targetMode: service.targetMode,
        instanceId: service.serverId,
      },
    });
  }

  const shouldInstallDefaultFollowingService =
    (!compatibleDefaultService && removableServices.length > 0)
    || (!compatibleDefaultService && repairableExternalDefaultServices.length > 0)
    || compatibleDefaultServiceNeedsReinstall;

  if (shouldInstallDefaultFollowingService) {
    actions.push({
      kind: 'install-default-following-service',
      releaseChannel: params.currentReleaseChannel,
      mode: compatibleDefaultServiceNeedsReinstall
        ? (compatibleDefaultService?.mode === 'system' ? 'system' : 'user')
        : params.preferredMode,
    });
  }

  return {
    currentReleaseChannel: params.currentReleaseChannel,
    existingServices: [...params.services],
    actions,
    manualWarnings: [],
  };
}
