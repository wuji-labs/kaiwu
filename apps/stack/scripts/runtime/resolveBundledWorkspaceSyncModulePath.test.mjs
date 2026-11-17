import test from 'node:test';
import assert from 'node:assert/strict';
// The resolver returns host-absolute paths (drive-qualified on win32), so stubs compare resolved forms.
import { resolve } from 'node:path';

import { resolveBundledWorkspaceSyncModulePath } from './resolveBundledWorkspaceSyncModulePath.mjs';

test('resolveBundledWorkspaceSyncModulePath resolves the monorepo helper from apps/stack', () => {
  const resolved = resolveBundledWorkspaceSyncModulePath('/repo/apps/stack', {
    existsSync: (candidate) => candidate === resolve('/repo/scripts/workspaces/syncBundledWorkspacePackages.mjs'),
  });

  assert.equal(resolved, resolve('/repo/scripts/workspaces/syncBundledWorkspacePackages.mjs'));
});

test('resolveBundledWorkspaceSyncModulePath stays disabled for packaged installs without the helper', () => {
  const resolved = resolveBundledWorkspaceSyncModulePath('/usr/local/lib/node_modules/@happier-dev/stack', {
    existsSync: () => false,
  });

  assert.equal(resolved, null);
});
