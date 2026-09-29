import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

import {
  installTestHomeDirectoryGuard,
  assertRealHomeDirectoriesUnmodified,
} from '@happier-dev/cli-common/fs/testHomeDirectoryGuard';

// Many CLI tests touch persistence under `HAPPIER_HOME_DIR`. Provide a per-process default
// home directory and install a global guard ensuring tests never write to real home directories.
const homeGuardState = installTestHomeDirectoryGuard();
const defaultHomeDir = homeGuardState.isolatedHomeDir;
process.env.HAPPIER_HOME_DIR = defaultHomeDir;
delete process.env.KAIWU_HOME_DIR;
mkdirSync(defaultHomeDir, { recursive: true });

afterEach(() => {
  assertRealHomeDirectoriesUnmodified();
});

// CLI unit tests should be machine-agnostic: provider CLIs are not expected to be installed
// on CI runners. Provide a default OpenCode CLI stub unless a test explicitly overrides it.
const opencodePath = String(process.env.HAPPIER_OPENCODE_PATH ?? '').trim();
if (!opencodePath) {
  const binDir = join(tmpdir(), `happier-dev-test-bin-${process.pid}`);
  mkdirSync(binDir, { recursive: true });
  const stubPath = join(binDir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  if (process.platform === 'win32') {
    writeFileSync(stubPath, '@echo off\r\nexit /B 0\r\n', 'utf8');
  } else {
    writeFileSync(stubPath, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(stubPath, 0o755);
  }
  process.env.HAPPIER_OPENCODE_PATH = stubPath;
}

// CLI tests should not inherit embedded build-policy gating (set in CI).
// Clear it by default so feature tests can opt-in explicitly per case.
process.env.HAPPIER_FEATURE_POLICY_ENV = '';
