import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectMissingPackageExportTargets } from '../../../scripts/workspaces/buildTypeScriptPackageDist.mjs';

export function collectMissingExportTargets({
  packageDir,
  packageJson,
  existsSyncImpl = existsSync,
}) {
  const resolvedPackageDir = resolve(packageDir);
  return collectMissingPackageExportTargets({
    packageDir: resolvedPackageDir,
    outputDir: join(resolvedPackageDir, 'dist'),
    packageJson,
    existsSyncImpl,
  }).map(({ target, path }) => ({
      target,
      relativePath: relative(resolvedPackageDir, path).replace(/\\/g, '/'),
    }));
}

export function verifyPackageExportTargets({
  packageDir,
  packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')),
  existsSyncImpl = existsSync,
}) {
  const missingTargets = collectMissingExportTargets({
    packageDir,
    packageJson,
    existsSyncImpl,
  });

  if (missingTargets.length === 0) {
    return;
  }

  const formattedTargets = missingTargets
    .map(({ relativePath }) => `- ${relativePath}`)
    .join('\n');
  throw new Error(
    `Missing files for declared package exports in ${packageJson.name ?? 'package'}:\n${formattedTargets}`,
  );
}

export function main() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  verifyPackageExportTargets({
    packageDir: dirname(scriptsDir),
  });
}

const isEntrypoint = (() => {
  const arg = typeof process.argv?.[1] === 'string' ? process.argv[1] : '';
  if (!arg) return false;
  return arg.endsWith('/scripts/verifyExports.mjs') || arg.endsWith('\\scripts\\verifyExports.mjs');
})();

if (isEntrypoint) {
  main();
}
