// @ts-check

import { execFileSync } from '../../lib/portable-child-process.mjs';
import { existsSync } from 'node:fs';
import { resolveArtifactVerifyExecution, resolveArtifactVerifyTarget } from '../../release/publishing/artifact-verify-target.mjs';

export { resolveArtifactVerifyExecution, resolveArtifactVerifyTarget };

/**
 * @param {readonly string[]} paths
 */
function assertPathsExist(paths) {
  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`artifact-verify expected path to exist: ${path}`);
    }
  }
}

/**
 * @param {{
 *   repoRoot: string;
 *   source: ReleaseValidationSource;
 *   options?: ArtifactVerifyOptions;
 * }} params
 */
export function runArtifactVerifyValidation({ repoRoot, source, options }) {
  const target = resolveArtifactVerifyTarget({ repoRoot, source, options });
  assertPathsExist(target.preflightPaths);
  const execution = resolveArtifactVerifyExecution({ repoRoot, source, options });
  execFileSync(execution.command, execution.args, {
    cwd: execution.cwd,
    stdio: 'inherit',
  });
}
