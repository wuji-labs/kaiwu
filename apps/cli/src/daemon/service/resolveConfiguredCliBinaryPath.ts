import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { PublicReleaseRingId } from '@happier-dev/release-runtime/releaseRings';
import {
  getFirstPartyComponentCatalogEntry,
  resolveFirstPartyInstallLayout,
} from '@happier-dev/cli-common/firstPartyRuntime';

function resolvePublicReleaseChannel(value: string | null | undefined): PublicReleaseRingId {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'preview') return 'preview';
  if (normalized === 'publicdev' || normalized === 'dev' || normalized === 'public-dev') {
    return 'publicdev';
  }
  return 'stable';
}

export function resolveConfiguredCliBinaryPath(params: Readonly<{
  happierHomeDir: string;
  releaseChannel?: string | null;
  platform: NodeJS.Platform;
}>): string {
  const channel = resolvePublicReleaseChannel(params.releaseChannel);
  const processEnv = {
    ...process.env,
    KAIWU_HOME_DIR: params.happierHomeDir,
    HAPPIER_HOME_DIR: params.happierHomeDir,
  };
  const layout = resolveFirstPartyInstallLayout({
    componentId: 'happier-daemon',
    channel,
    processEnv,
  });
  const component = getFirstPartyComponentCatalogEntry('happier-daemon');
  const extension = params.platform === 'win32' ? '.exe' : '';
  const shimPaths = layout.installShims.map((shimName) => join(layout.shimDir, `${shimName}${extension}`));
  const primaryCurrentPath = join(
    layout.currentPath,
    `${component.binaryRelativePath}${extension}`,
  );
  const compatibilityCurrentPath = join(layout.currentPath, `happier${extension}`);
  const candidates = [
    ...shimPaths,
    primaryCurrentPath,
    compatibilityCurrentPath,
  ];

  return candidates.find((candidate) => existsSync(candidate))
    ?? shimPaths[0]
    ?? primaryCurrentPath;
}
