import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { syncBundledWorkspacePackages } from '../../../scripts/workspaces/syncBundledWorkspacePackages.mjs';
import { resolveBundledWorkspaceDependencyBuildOrder } from '../../../scripts/workspaces/resolveWorkspaceDependencyBuildOrder.mjs';
import { withWorkspaceBundleLock } from '../../../scripts/workspaces/workspaceBundleLock.mjs';
import {
  ensureWorkspacePackagesBuiltByName,
  ensureWorkspacePackagesBuiltForComponent,
} from '../../../scripts/workspaces/ensureWorkspacePackagesBuilt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function withBuildSharedDepsLock(fn, options = {}) {
  const lockPath = options.lockPath ?? DEFAULT_BUILD_LOCK_PATH;
  return await withWorkspaceBundleLock(fn, {
    ...options,
    lockPath,
    heldLockValue: options.heldLockValue
      ?? options.heldLockPath
      ?? (options.env ?? process.env)?.HAPPIER_WORKSPACE_DIST_BUILD_LOCK_HELD,
  });
}

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, 'yarn.lock'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback for older layouts (repoRoot/apps/cli/scripts).
  return resolve(startDir, '..', '..', '..');
}

const repoRoot = findRepoRoot(__dirname);
const DEFAULT_BUILD_LOCK_PATH = resolve(repoRoot, '.project', 'tmp', 'cli-dist-build.lock');
let loadedCliCommonWorkspacesModule = null;

async function loadCliCommonWorkspacesModule(options = {}) {
  if (loadedCliCommonWorkspacesModule) {
    return { helpers: loadedCliCommonWorkspacesModule };
  }
  const modulePath = resolve(repoRoot, 'packages', 'cli-common', 'dist', 'workspaces', 'index.js');

  if (!existsSync(modulePath)) {
    await ensureWorkspacePackagesBuiltByName(repoRoot, ['@happier-dev/cli-common'], {
      quiet: options.quiet === true,
      env: options.env ?? process.env,
    });
  }

  if (!existsSync(modulePath)) {
    throw new Error(`Missing cli-common workspaces build helpers: ${modulePath}`);
  }

  loadedCliCommonWorkspacesModule = await import(pathToFileURL(modulePath).href);
  return { helpers: loadedCliCommonWorkspacesModule };
}
const CLI_BUNDLED_HOST_APPS = ['cli'];
function resolveCliBundledWorkspacePackageNames({ root = repoRoot, exists = existsSync } = {}) {
  return resolveBundledWorkspaceDependencyBuildOrder({
    repoRoot: root,
    hostPackageDir: resolve(root, 'apps', 'cli'),
    existsSync: exists,
  }).filter((workspaceName) => exists(resolve(root, 'packages', workspaceName, 'tsconfig.json')));
}

function collectDeclarationTargets(value, result) {
  if (typeof value === 'string') {
    if (/^\.\/dist\/.*\.d\.(?:ts|mts|cts)$/.test(value)) result.add(value.slice(2));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    collectDeclarationTargets(nested, result);
  }
}

function collectManifestRelativeTargets(value, result) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('*')) return;
    if (trimmed.startsWith('./')) {
      result.add(trimmed.slice(2));
      return;
    }
    if (!trimmed.startsWith('/') && !trimmed.startsWith('\\') && !trimmed.includes(':')) {
      result.add(trimmed);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    collectManifestRelativeTargets(nested, result);
  }
}

export function resolveWorkspaceDeclarationPaths(packageDir, readFile = readFileSync) {
  const targets = new Set();
  try {
    const packageJson = JSON.parse(readFile(resolve(packageDir, 'package.json'), 'utf8'));
    collectDeclarationTargets(packageJson.types, targets);
    collectDeclarationTargets(packageJson.exports, targets);
  } catch {
    // A malformed or absent manifest is handled as a missing declaration below.
  }
  if (targets.size === 0) targets.add('dist/index.d.ts');
  return [...targets].map((target) => resolve(packageDir, target));
}

function resolveWorkspaceFreshnessPaths(packageDir, readFile = readFileSync) {
  const targets = new Set();
  let hasDeclarationTarget = false;
  try {
    const packageJson = JSON.parse(readFile(resolve(packageDir, 'package.json'), 'utf8'));
    collectManifestRelativeTargets(packageJson.main, targets);
    collectManifestRelativeTargets(packageJson.module, targets);
    collectManifestRelativeTargets(packageJson.types, targets);
    collectManifestRelativeTargets(packageJson.typings, targets);
    collectManifestRelativeTargets(packageJson.exports, targets);
    collectManifestRelativeTargets(packageJson.bin, targets);
    hasDeclarationTarget = [...targets].some((target) => /\.d\.(?:ts|mts|cts)$/.test(target));
  } catch {
    // A malformed or absent manifest is handled as a missing declaration below.
  }
  if (!hasDeclarationTarget) targets.add('dist/index.d.ts');
  return [...targets].map((target) => resolve(packageDir, target));
}

function isBundledDeclarationCopyStale({ root, packageDir, workspaceName, fsOps = {} }) {
  const exists = fsOps.exists ?? existsSync;
  const stat = fsOps.stat ?? statSync;
  const destPackageDir = resolve(root, 'apps', 'cli', 'node_modules', '@happier-dev', workspaceName);
  if (!exists(resolve(destPackageDir, 'package.json'))) return true;
  for (const sourcePath of resolveWorkspaceFreshnessPaths(packageDir, fsOps.readFile ?? readFileSync)) {
    const relativePath = sourcePath.slice(packageDir.length + 1);
    const destPath = resolve(destPackageDir, relativePath);
    if (!exists(destPath)) return true;
    try {
      if (Number(stat(sourcePath).mtimeMs ?? 0) > Number(stat(destPath).mtimeMs ?? 0)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export async function ensureCliDeclarationPrerequisites(options = {}) {
  const root = typeof options.repoRoot === 'string' ? options.repoRoot : repoRoot;
  const workspaceNames = options.workspaceNames ?? resolveCliBundledWorkspacePackageNames({ root });
  const fsOps = {
    exists: options.existsSync,
    readFile: options.readFileSync,
    stat: options.statSync,
  };
  const collectSyncPlan = () => workspaceNames.filter((name) => {
    const packageDir = resolve(root, 'packages', name);
    return isBundledDeclarationCopyStale({ root, packageDir, workspaceName: name, fsOps });
  });
  const ensureWorkspaceOutputs = () => (options.ensureWorkspacePackagesBuiltImpl ?? ensureWorkspacePackagesBuiltForComponent)(resolve(root, 'apps', 'cli'), {
    quiet: options.quiet !== false,
    env: options.env ?? process.env,
  });

  // The workspace owner performs its read-only freshness admission before taking
  // each package publication lock. Bundled-copy freshness remains local to this
  // CLI host because it does not own the source package's dist lifecycle.
  const initialBuild = await ensureWorkspaceOutputs();
  if (collectSyncPlan().length === 0) {
    return { built: initialBuild.built.length > 0, reason: 'current' };
  }

  const withLock = options.withBuildSharedDepsLockImpl ?? withBuildSharedDepsLock;
  return withLock(async () => {
    const lockedBuild = await ensureWorkspaceOutputs();
    const syncNames = collectSyncPlan();
    if (syncNames.length === 0) return { built: false, reason: 'current-after-lock' };
    const syncDist = options.syncBundledWorkspaceDistImpl ?? syncBundledWorkspaceDist;
    await syncDist({
      repoRoot: root,
      workspaceNames: syncNames,
      includeRuntimeDependencies: options.includeRuntimeDependencies === true,
    });
    return {
      built: initialBuild.built.length > 0 || lockedBuild.built.length > 0,
      workspaces: syncNames,
    };
  }, options);
}

export function syncBundledWorkspaceDist(opts = {}) {
  const repoRootArg = opts.repoRoot;
  const repoRoot = typeof repoRootArg === 'string' && repoRootArg.trim() ? repoRootArg : findRepoRoot(__dirname);
  syncBundledWorkspacePackages({
    repoRoot,
    hostApps: Array.isArray(opts.bundledHostApps) && opts.bundledHostApps.length > 0 ? opts.bundledHostApps : CLI_BUNDLED_HOST_APPS,
    ...(Array.isArray(opts.workspaceNames) && opts.workspaceNames.length > 0 ? { packages: opts.workspaceNames } : {}),
    ...(opts.includeRuntimeDependencies === false
      ? { vendorBundledPackageRuntimeDependencies: () => {} }
      : {}),
    existsSync: opts.existsSync,
    cpSync: opts.cpSync,
    mkdirSync: opts.mkdirSync,
    rmSync: opts.rmSync,
    readFileSync: opts.readFileSync,
    writeFileSync: opts.writeFileSync,
  });
}

export async function syncCliRuntimeDependencies(opts = {}) {
  const helpers = opts.workspaceHelpers ?? (await loadCliCommonWorkspacesModule()).helpers;
  const { bundleInstalledPackageWithRuntimeDependencies } = helpers;
  const repoRootArg = opts.repoRoot;
  const repoRoot = typeof repoRootArg === 'string' && repoRootArg.trim() ? repoRootArg : findRepoRoot(__dirname);
  const cliPackageJsonPath = resolve(repoRoot, 'apps', 'cli', 'package.json');
  const cliNodeModulesDir = resolve(repoRoot, 'apps', 'cli', 'node_modules');
  const cliRequire = createRequire(pathToFileURL(cliPackageJsonPath).href);
  const resolvedTweetnaclEntry = cliRequire.resolve('tweetnacl');
  const resolvedTweetnaclDir = dirname(resolvedTweetnaclEntry);

  if (resolvedTweetnaclDir === resolve(cliNodeModulesDir, 'tweetnacl')) {
    return;
  }

  bundleInstalledPackageWithRuntimeDependencies({
    packageName: 'tweetnacl',
    resolveFromPackageJsonPath: cliPackageJsonPath,
    destNodeModulesDir: cliNodeModulesDir,
  });
}

export async function syncBundledWorkspaceRuntimeDependencies(opts = {}) {
  const helpers = opts.workspaceHelpers ?? (await loadCliCommonWorkspacesModule()).helpers;
  const { resolveWorkspaceBundlesFromPackageJson, vendorBundledPackageRuntimeDependencies } = helpers;
  const repoRootArg = opts.repoRoot;
  const repoRoot = typeof repoRootArg === 'string' && repoRootArg.trim() ? repoRootArg : findRepoRoot(__dirname);
  const bundles = resolveWorkspaceBundlesFromPackageJson({
    repoRoot,
    hostPackageDir: resolve(repoRoot, 'apps', 'cli'),
  });

  for (const bundle of bundles) {
    vendorBundledPackageRuntimeDependencies({
      srcPackageJsonPath: resolve(bundle.srcDir, 'package.json'),
      destPackageDir: bundle.destDir,
    });
  }
}

export function main(options = {}) {
  if (options.mode === 'declarations' || options.mode === 'source-dev') {
    return ensureCliDeclarationPrerequisites({
      ...options,
      includeRuntimeDependencies: options.mode === 'source-dev',
    });
  }

  const build = async () => {
    await ensureWorkspacePackagesBuiltForComponent(resolve(repoRoot, 'apps', 'cli'), {
      quiet: options.quiet === true,
      env: options.env ?? process.env,
    });
    const loadHelpersImpl = options.loadCliCommonWorkspacesModuleImpl ?? loadCliCommonWorkspacesModule;
    const { helpers } = await loadHelpersImpl(options);
    const syncDistImpl = options.syncBundledWorkspaceDistImpl ?? syncBundledWorkspaceDist;
    const syncRuntimeDepsImpl = options.syncBundledWorkspaceRuntimeDependenciesImpl ?? syncBundledWorkspaceRuntimeDependencies;
    const syncCliDepsImpl = options.syncCliRuntimeDependenciesImpl ?? syncCliRuntimeDependencies;

    const protocolDist = resolve(repoRoot, 'packages', 'protocol', 'dist', 'index.js');
    if (!existsSync(protocolDist)) {
      throw new Error(`Expected @happier-dev/protocol build output missing: ${protocolDist}`);
    }

    // If the CLI currently has bundled workspace deps under apps/cli/node_modules,
    // keep their dist outputs in sync so local builds/tests do not consume stale artifacts.
    await syncDistImpl({ repoRoot, workspaceHelpers: helpers });
    await syncRuntimeDepsImpl({ repoRoot, workspaceHelpers: helpers });
    await syncCliDepsImpl({ repoRoot, workspaceHelpers: helpers });
  };

  if (options.skipLock === true) {
    return build();
  }
  return withBuildSharedDepsLock(build, options);
}

const invokedAsMain = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(argv1).href;
})();

if (invokedAsMain) {
  const mode = process.argv.includes('--declarations')
    ? 'declarations'
    : process.argv.includes('--source-dev')
      ? 'source-dev'
      : 'runtime';
  main({ mode }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
