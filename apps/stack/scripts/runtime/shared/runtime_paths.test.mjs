import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveStackArtifactsDir,
  resolveStackComponentArtifactDir,
  resolveStackRuntimePaths,
} from './runtime_paths.mjs';
import { normalize } from 'node:path';

// Fixtures use POSIX-shaped absolute paths; the code under test builds paths with node:path, so
// compare against the host-native form (identity on POSIX, `\` separators on win32).
const nativePath = (posixPath) => normalize(posixPath);


test('resolveStackArtifactsDir places artifacts under the stack base dir', () => {
  const dir = resolveStackArtifactsDir({ stackBaseDir: nativePath('/tmp/happier/stacks/prod-dev') });

  assert.equal(dir, nativePath('/tmp/happier/stacks/prod-dev/artifacts'));
});

test('resolveStackComponentArtifactDir scopes artifacts by component and fingerprint', () => {
  const dir = resolveStackComponentArtifactDir({
    stackBaseDir: nativePath('/tmp/happier/stacks/prod-dev'),
    component: 'server',
    fingerprint: 'abc123',
  });

  assert.equal(dir, nativePath('/tmp/happier/stacks/prod-dev/artifacts/server/abc123'));
});

test('resolveStackRuntimePaths exposes build and activation locations', () => {
  const paths = resolveStackRuntimePaths({
    stackBaseDir: nativePath('/tmp/happier/stacks/prod-dev'),
    snapshotId: 'snap-1',
  });

  assert.deepEqual(paths, {
    runtimeDir: nativePath('/tmp/happier/stacks/prod-dev/runtime'),
    buildsDir: nativePath('/tmp/happier/stacks/prod-dev/runtime/builds'),
    currentDir: nativePath('/tmp/happier/stacks/prod-dev/runtime/current'),
    currentPath: nativePath('/tmp/happier/stacks/prod-dev/runtime/current.json'),
    currentManifestPath: nativePath('/tmp/happier/stacks/prod-dev/runtime/current/manifest.json'),
    lockPath: nativePath('/tmp/happier/stacks/prod-dev/runtime/build.lock'),
    snapshotDir: nativePath('/tmp/happier/stacks/prod-dev/runtime/builds/snap-1'),
    manifestPath: nativePath('/tmp/happier/stacks/prod-dev/runtime/builds/snap-1/manifest.json'),
  });
});
