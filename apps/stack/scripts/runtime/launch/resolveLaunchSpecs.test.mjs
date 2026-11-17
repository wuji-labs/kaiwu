import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCliRuntimeLaunchProvenanceEnv,
  resolveCliRuntimeLaunchProvenance,
  resolveCliRuntimeLaunchSpec,
} from './resolveCliRuntimeLaunchSpec.mjs';
import { resolveServerRuntimeLaunchSpec } from './resolveServerRuntimeLaunchSpec.mjs';
import { join, normalize } from 'node:path';

// Fixtures use POSIX-shaped absolute paths; the code under test builds paths with node:path, so
// compare against the host-native form (identity on POSIX, `\` separators on win32).
const nativePath = (posixPath) => normalize(posixPath);


test('resolveCliRuntimeLaunchSpec returns a runtime binary command from the snapshot', () => {
  const resolved = resolveCliRuntimeLaunchSpec({
    snapshot: {
      snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
      daemonDistClosureFingerprint: '1111111111111111',
      manifest: {
        components: {
          daemon: { entrypoint: 'cli/happier' },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    source: 'runtime',
    cliDir: nativePath('/tmp/stack/runtime/builds/snap-1/cli'),
    entrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/cli/happier'),
    nodeEntrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/cli/package-dist/index.mjs'),
    command: nativePath('/tmp/stack/runtime/builds/snap-1/cli/happier'),
    args: [],
    runtimeBacked: true,
    daemonDistClosureFingerprint: '1111111111111111',
  });
});

test('runtime CLI provenance is one canonical shape for daemon options and nested CLI environment', () => {
  const launchSpec = resolveCliRuntimeLaunchSpec({
    snapshot: {
      snapshotPath: nativePath('/tmp/runtime/builds/snap-a'),
      launchPath: nativePath('/tmp/runtime/builds/snap-a'),
      daemonDistClosureFingerprint: 'abcdef1234567890',
      manifest: {
        entrypoints: { daemon: 'cli/happier' },
      },
    },
  });

  assert.deepEqual(resolveCliRuntimeLaunchProvenance(launchSpec), {
    runtimeBacked: true,
    admittedDistClosureFingerprint: 'abcdef1234567890',
    distEntrypoint: nativePath('/tmp/runtime/builds/snap-a/cli/package-dist/index.mjs'),
  });
  const projected = applyCliRuntimeLaunchProvenanceEnv({
    env: {},
    cliLaunchSpec: launchSpec,
  });
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_RUNTIME_BACKED, '1');
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_DIST_ENTRYPOINT, nativePath('/tmp/runtime/builds/snap-a/cli/package-dist/index.mjs'));
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_DAEMON_DIST_CLOSURE_FINGERPRINT, 'abcdef1234567890');
});

test('source CLI provenance clears inherited runtime-backed subprocess policy', () => {
  const projected = applyCliRuntimeLaunchProvenanceEnv({
    env: {
      HAPPIER_CLI_SUBPROCESS_RUNTIME_BACKED: '1',
      HAPPIER_CLI_SUBPROCESS_DIST_ENTRYPOINT: '/stale/runtime/index.mjs',
      HAPPIER_CLI_SUBPROCESS_DAEMON_DIST_CLOSURE_FINGERPRINT: 'abcdef1234567890',
      KEEP_ME: 'yes',
    },
    cliLaunchSpec: null,
  });
  assert.deepEqual(resolveCliRuntimeLaunchProvenance(null), {
    runtimeBacked: false,
    admittedDistClosureFingerprint: null,
    distEntrypoint: '',
  });
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_RUNTIME_BACKED, undefined);
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_DIST_ENTRYPOINT, undefined);
  assert.equal(projected.HAPPIER_CLI_SUBPROCESS_DAEMON_DIST_CLOSURE_FINGERPRINT, undefined);
  assert.equal(projected.KEEP_ME, 'yes');
});

test('resolveServerRuntimeLaunchSpec returns the runtime server binary command from the snapshot', () => {
  const resolved = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server-light',
    snapshot: {
      snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
      manifest: {
        source: { serverComponent: 'happier-server-light' },
        components: {
          server: { entrypoint: 'server/happier-server' },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    source: 'runtime',
    serverDir: nativePath('/tmp/stack/runtime/builds/snap-1/server'),
    entrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server'),
    command: nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server'),
    args: [],
    migration: { mode: 'in-process' },
  });
});

test('resolveServerRuntimeLaunchSpec rejects a snapshot without admitted server component metadata', () => {
  assert.throws(
    () => resolveServerRuntimeLaunchSpec({
      serverComponent: 'happier-server',
      snapshot: { snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1') },
    }),
    (error) => error.code === 'ERUNTIMESERVERCOMPONENTUNAVAILABLE'
      && error.reason === 'missing_admitted_server_component',
  );
});

test('resolveServerRuntimeLaunchSpec rejects both requested/admitted server component mismatch directions', () => {
  for (const [requested, admitted] of [
    ['happier-server-light', 'happier-server'],
    ['happier-server', 'happier-server-light'],
  ]) {
    assert.throws(
      () => resolveServerRuntimeLaunchSpec({
        serverComponent: requested,
        snapshot: {
          snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
          manifest: {
            source: { serverComponent: admitted },
            components: { server: { entrypoint: 'server/happier-server' } },
          },
        },
      }),
      (error) => error.code === 'ERUNTIMESERVERCOMPONENTMISMATCH'
        && error.requestedServerComponent === requested
        && error.admittedServerComponent === admitted,
      `${requested} must reject admitted ${admitted}`,
    );
  }
});

test('resolveServerRuntimeLaunchSpec derives the Windows full-server migration executable beside the admitted entrypoint', () => {
  const resolved = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server',
    dbProvider: 'postgres',
    snapshot: {
      snapshotPath: 'C:\\runtime\\builds\\snap-1',
      manifest: {
        source: { serverComponent: 'happier-server' },
        components: {
          server: { entrypoint: 'server/happier-server.exe' },
        },
      },
    },
  });

  // Derived beside the admitted entrypoint with the host path separator.
  assert.equal(resolved.migration.command, join('C:\\runtime\\builds\\snap-1', 'server', 'happier-server-migrate.exe'));
  assert.deepEqual(resolved.migration.args, []);
  assert.equal(resolved.migration.cwd, join('C:\\runtime\\builds\\snap-1', 'server'));
});

test('resolveServerRuntimeLaunchSpec derives packaged migrations from the provider, not the preset', () => {
  const snapshot = {
    snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
    manifest: {
      source: { serverComponent: 'happier-server-light' },
      components: { server: { entrypoint: 'server/happier-server' } },
    },
  };

  const postgres = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server-light',
    dbProvider: 'postgres',
    snapshot,
  });
  assert.equal(postgres.migration.command, nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server-migrate'));

  const pglite = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server-light',
    dbProvider: 'pglite',
    snapshot,
  });
  assert.equal(pglite.migration.command, nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server-migrate'));

  const sqlite = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server-light',
    dbProvider: 'sqlite',
    snapshot,
  });
  assert.deepEqual(sqlite.migration, { mode: 'in-process' });

  const disabled = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server-light',
    dbProvider: 'postgres',
    migrationsEnabled: false,
    snapshot,
  });
  assert.deepEqual(disabled.migration, { mode: 'disabled' });
});

test('resolveCliRuntimeLaunchSpec falls back to the canonical cli path when the manifest entrypoint escapes the snapshot root', () => {
  const resolved = resolveCliRuntimeLaunchSpec({
    snapshot: {
      snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
      daemonDistClosureFingerprint: '1111111111111111',
      manifest: {
        components: {
          daemon: { entrypoint: '../outside-cli' },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    source: 'runtime',
    cliDir: nativePath('/tmp/stack/runtime/builds/snap-1/cli'),
    entrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/cli/kaiwu'),
    nodeEntrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/cli/package-dist/index.mjs'),
    command: nativePath('/tmp/stack/runtime/builds/snap-1/cli/kaiwu'),
    args: [],
    runtimeBacked: true,
    daemonDistClosureFingerprint: '1111111111111111',
  });
});

test('resolveServerRuntimeLaunchSpec falls back to the canonical server path when the manifest entrypoint escapes the snapshot root', () => {
  const resolved = resolveServerRuntimeLaunchSpec({
    serverComponent: 'happier-server',
    dbProvider: 'postgres',
    snapshot: {
      snapshotPath: nativePath('/tmp/stack/runtime/builds/snap-1'),
      manifest: {
        source: { serverComponent: 'happier-server' },
        components: {
          server: { entrypoint: '../outside-server' },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    source: 'runtime',
    serverDir: nativePath('/tmp/stack/runtime/builds/snap-1/server'),
    entrypoint: nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server'),
    command: nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server'),
    args: [],
    migration: {
      mode: 'packaged',
      command: nativePath('/tmp/stack/runtime/builds/snap-1/server/happier-server-migrate'),
      args: [],
      cwd: nativePath('/tmp/stack/runtime/builds/snap-1/server'),
    },
  });
});
