import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

import {
  isAbsolutePathForPathShape,
  isWin32ShapedAbsolutePath,
  joinPathForPathShape,
  resolvePathForPathShape,
} from '../path/pathShape.js';

let warnedHomeDirDeprecated = false;

export function resetHappyHomeDirWarningsForTests(): void {
  warnedHomeDirDeprecated = false;
}

export function resolveHappyHomeDirFromEnvironment(
  processEnv: NodeJS.ProcessEnv = process.env,
  options: { warn?: (message: string) => void } = {},
): string {
  const override =
    typeof processEnv.KAIWU_HOME_DIR === 'string' && processEnv.KAIWU_HOME_DIR.trim()
      ? processEnv.KAIWU_HOME_DIR.trim()
      : typeof processEnv.HAPPIER_HOME_DIR === 'string'
        ? processEnv.HAPPIER_HOME_DIR.trim()
        : '';

  if (override) {
    const envHome =
      process.platform === 'win32'
        ? (processEnv.USERPROFILE || processEnv.HOME)
        : processEnv.HOME;
    const normalizedHome = typeof envHome === 'string' ? envHome.trim() : '';
    const expandedOverride =
      override === '~'
        ? (normalizedHome || homedir())
        : override.startsWith('~/') || override.startsWith('~\\')
          ? joinPathForPathShape(normalizedHome || homedir(), override.slice(2))
          : override;
    if (process.platform !== 'win32' && isWin32ShapedAbsolutePath(expandedOverride)) {
      throw new Error(`Windows-shaped home overrides are not supported on ${process.platform}`);
    }
    return isAbsolutePathForPathShape(expandedOverride) ? expandedOverride : resolvePathForPathShape(expandedOverride);
  }

  const envHome =
    process.platform === 'win32'
      ? ((processEnv.USERPROFILE ?? processEnv.HOME ?? '').trim())
      : ((processEnv.HOME ?? processEnv.USERPROFILE ?? '').trim());
  let baseHome = envHome;
  if (!baseHome) {
    try {
      baseHome = homedir();
    } catch {
      baseHome = '';
    }
  }

  if (!baseHome) {
    baseHome = tmpdir();
  }

  const kaiwuDir = joinPathForPathShape(baseHome, '.kaiwu');
  const happierDir = joinPathForPathShape(baseHome, '.happier');

  if (!existsSync(kaiwuDir) && existsSync(happierDir)) {
    if (!warnedHomeDirDeprecated) {
      warnedHomeDirDeprecated = true;
      const warn = options.warn ?? ((msg: string) => console.warn(msg));
      warn('[kaiwu] ~/.happier is deprecated, use ~/.kaiwu');
    }
    return happierDir;
  }

  return kaiwuDir;
}
