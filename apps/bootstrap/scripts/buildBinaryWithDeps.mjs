import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const bootstrapDir = dirname(dirname(fileURLToPath(import.meta.url)));
const steps = [
  ['scripts/buildSharedDeps.mjs'],
  ['../../scripts/workspaces/buildTypeScriptPackageDist.mjs', '-p', 'tsconfig.json'],
  ['scripts/writeDistBinWrappers.mjs'],
  ['scripts/buildBinary.mjs'],
];

for (const args of steps) {
  const result = spawnSync(process.execPath, args, {
    cwd: bootstrapDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
