import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runNodeCapture } from './testkit/core/run_node_capture.mjs';
import { coerceHappyMonorepoRootFromPath } from './utils/paths/paths.mjs';

function stackRootDirFromMeta(metaUrl) {
  const scriptsDir = dirname(fileURLToPath(metaUrl));
  return dirname(scriptsDir);
}

function createBundledSyncFixture(rootDir, fixtureDir, { simulateMissingUpdateUntilSync = false } = {}) {
  const syncMarkerPath = join(fixtureDir, 'sync.json');
  const syncStubPath = join(fixtureDir, 'syncBundledWorkspacePackages.mjs');
  const resolveSyncModulePathStubPath = join(fixtureDir, 'resolveBundledWorkspaceSyncModulePath.mjs');
  const loaderPath = join(fixtureDir, 'loader.mjs');

  writeFileSync(
    syncStubPath,
    [
      "import { writeFileSync } from 'node:fs';",
      'export function syncBundledWorkspacePackages(opts) {',
      `  writeFileSync(${JSON.stringify(syncMarkerPath)}, JSON.stringify(opts), 'utf8');`,
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    resolveSyncModulePathStubPath,
    [
      'export function resolveBundledWorkspaceSyncModulePath() {',
      `  return ${JSON.stringify(syncStubPath)};`,
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    loaderPath,
    [
      "import { existsSync } from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      '',
      'export async function resolve(specifier, context, defaultResolve) {',
      "  if (specifier === '../scripts/runtime/resolveBundledWorkspaceSyncModulePath.mjs') {",
      `    return { url: pathToFileURL(${JSON.stringify(resolveSyncModulePathStubPath)}).href, shortCircuit: true };`,
      '  }',
      ...(simulateMissingUpdateUntilSync
        ? [
            "  if (specifier === '@happier-dev/cli-common/update') {",
            `    if (!existsSync(${JSON.stringify(syncMarkerPath)})) {`,
            "      const error = new Error('Package subpath ./update is not defined by exports in partial bundled @happier-dev/cli-common copy');",
            "      error.code = 'ERR_PACKAGE_PATH_NOT_EXPORTED';",
            '      throw error;',
            '    }',
            '  }',
          ]
        : []),
      '  return defaultResolve(specifier, context, defaultResolve);',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  return { loaderPath, syncMarkerPath };
}

test('hstack wrapper refreshes bundled workspace packages before a runtime command without replacing existing directories', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const repoRoot = coerceHappyMonorepoRootFromPath(rootDir);
  assert.ok(repoRoot, `expected monorepo root for ${rootDir}`);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-bundled-sync-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });

    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'where'], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
      },
    });

    assert.equal(res.code, 0, `expected exit 0, got ${res.code}\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`);
    const syncOptions = JSON.parse(readFileSync(syncMarkerPath, 'utf8'));
    assert.equal(syncOptions.repoRoot, repoRoot);
    assert.deepEqual(syncOptions.hostApps, ['stack']);
    assert.equal(syncOptions.replaceExisting, false);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack root help bypasses bundled workspace preflight', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-root-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), '--help'], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected root help exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack/);
    assert.equal(existsSync(syncMarkerPath), false, 'root help must not contend on the workspace preflight lock');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('bare hstack root help bypasses bundled workspace preflight', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-bare-root-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs')], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected bare root help exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack/);
    assert.equal(existsSync(syncMarkerPath), false, 'bare root help must not contend on the workspace preflight lock');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack -h root help bypasses bundled workspace preflight and partial bundled update imports', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-short-root-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), '-h'], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected short root help exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack/);
    assert.equal(existsSync(syncMarkerPath), false, 'short root help must not contend on the workspace preflight lock');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack help root help bypasses bundled workspace preflight and partial bundled update imports', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-help-root-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'help'], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected help root exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack/);
    assert.equal(existsSync(syncMarkerPath), false, 'help root must not contend on the workspace preflight lock');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack dependency-importing command help retains bundled workspace preflight repair', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-command-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'stack', '--help'], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected command help exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack stack/);
    const syncOptions = JSON.parse(readFileSync(syncMarkerPath, 'utf8'));
    assert.deepEqual(syncOptions.hostApps, ['stack']);
    assert.equal(syncOptions.replaceExisting, false, 'command help must retain partial-copy repair semantics');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack help command routing retains bundled workspace preflight repair', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-help-command-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'help', 'stack'], {
      cwd: rootDir,
      env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}` },
    });

    assert.equal(res.code, 0, `expected routed command help exit 0\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack stack/);
    const syncOptions = JSON.parse(readFileSync(syncMarkerPath, 'utf8'));
    assert.equal(syncOptions.replaceExisting, false, 'help command routing must retain partial-copy repair semantics');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack wrapper keeps dependency-free dev-target commands responsive during workspace builds', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-dev-targets-skip-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir, {
      simulateMissingUpdateUntilSync: true,
    });
    const res = await runNodeCapture(
      [join(rootDir, 'bin', 'hstack.mjs'), 'dev-targets', 'path', '--stack=repo-test'],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          HAPPIER_STACK_CLI_ROOT_DISABLE: '1',
          HAPPIER_STACK_UPDATE_CHECK: '0',
          NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
        },
      },
    );

    assert.equal(res.code, 0, `expected exit 0, got ${res.code}\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`);
    assert.match(res.stdout, /repo-test/);
    assert.equal(
      existsSync(syncMarkerPath),
      false,
      'dependency-free dev-target commands must not wait for unrelated bundled workspace publication',
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack service mode exits successfully before preflight when its explicit stack env is missing', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-missing-service-env-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir);
    const missingEnvPath = join(fixtureDir, 'archived-stack', 'env');
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'start', '--restart'], {
      cwd: rootDir,
      env: {
        ...process.env,
        HAPPIER_STACK_ENV_FILE: missingEnvPath,
        HAPPIER_STACK_SERVICE_MODE: '1',
        NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
      },
    });

    assert.equal(res.code, 0, `missing service env must be a non-restarting disposition\nstderr:\n${res.stderr}`);
    assert.match(res.stderr, /configured stack env file is missing/i);
    assert.match(res.stderr, new RegExp(missingEnvPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(existsSync(syncMarkerPath), false, 'missing service env must be rejected before workspace preflight');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack service mode only treats the installed start --restart invocation as terminal success', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-missing-service-env-nonstart-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir);
    const missingEnvPath = join(fixtureDir, 'archived-stack', 'env');
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'where'], {
      cwd: rootDir,
      env: {
        ...process.env,
        HAPPIER_STACK_ENV_FILE: missingEnvPath,
        HAPPIER_STACK_SERVICE_MODE: '1',
        NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
      },
    });

    assert.notEqual(res.code, 0, 'service-mode non-start invocation must fail instead of silently succeeding');
    assert.match(res.stderr, /configured stack env file is missing/i);
    assert.equal(existsSync(syncMarkerPath), false, 'missing env must still fail before preflight');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack help remains available with service mode and a missing explicit env', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-missing-service-env-help-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir);
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), '--help'], {
      cwd: rootDir,
      env: {
        ...process.env,
        HAPPIER_STACK_ENV_FILE: join(fixtureDir, 'missing', 'env'),
        HAPPIER_STACK_SERVICE_MODE: '1',
        NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
      },
    });

    assert.equal(res.code, 0, `help must remain available\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /hstack/);
    assert.equal(existsSync(syncMarkerPath), false, 'dependency-free root help must remain preflight-free');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('hstack interactive invocation fails clearly before preflight when its explicit stack env is missing', async () => {
  const rootDir = stackRootDirFromMeta(import.meta.url);
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hstack-wrapper-missing-interactive-env-'));
  try {
    const { loaderPath, syncMarkerPath } = createBundledSyncFixture(rootDir, fixtureDir);
    const missingEnvPath = join(fixtureDir, 'typo', 'env');
    const res = await runNodeCapture([join(rootDir, 'bin', 'hstack.mjs'), 'where'], {
      cwd: rootDir,
      env: {
        ...process.env,
        HAPPIER_STACK_ENV_FILE: missingEnvPath,
        HAPPIER_STACK_SERVICE_MODE: '',
        NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loaderPath).href}`,
      },
    });

    assert.notEqual(res.code, 0, 'interactive missing env typo must fail');
    assert.match(res.stderr, /configured stack env file is missing/i);
    assert.equal(existsSync(syncMarkerPath), false, 'interactive env typo must fail before workspace preflight');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
