import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function readRepoJson(relPath) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const abs = path.join(repoRoot, relPath);
  assert.ok(fs.existsSync(abs), `Expected file at ${abs}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function repoPath(relPath) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return path.join(path.resolve(here, '..', '..', '..'), relPath);
}

function normalizeHappierWorkspaceToken(packageName) {
  const raw = String(packageName ?? '').trim();
  return raw.startsWith('@happier-dev/') ? raw.slice('@happier-dev/'.length) : raw;
}

function parseScopeTokens(rawScope) {
  return new Set(
    String(rawScope ?? '')
      .split(/[,\s]+/g)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function findUiFirstPartyNativeExpoModules() {
  const rootPackageJson = readRepoJson('package.json');
  const appPackageJson = readRepoJson('apps/ui/package.json');
  const workspacePackagePaths = Array.isArray(rootPackageJson?.workspaces?.packages)
    ? rootPackageJson.workspaces.packages
    : [];

  const nativeWorkspaceByName = new Map();
  for (const workspacePath of workspacePackagePaths) {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    const expoModuleConfigPath = path.join(workspacePath, 'expo-module.config.json');
    if (!fs.existsSync(repoPath(packageJsonPath)) || !fs.existsSync(repoPath(expoModuleConfigPath))) continue;

    const packageJson = readRepoJson(packageJsonPath);
    if (typeof packageJson?.name !== 'string' || !packageJson.name.startsWith('@happier-dev/')) continue;

    nativeWorkspaceByName.set(packageJson.name, {
      packageName: packageJson.name,
      workspacePath,
      config: readRepoJson(expoModuleConfigPath),
    });
  }

  const appDependencies = {
    ...(appPackageJson.dependencies ?? {}),
    ...(appPackageJson.optionalDependencies ?? {}),
  };

  return Object.keys(appDependencies)
    .filter((packageName) => nativeWorkspaceByName.has(packageName))
    .map((packageName) => nativeWorkspaceByName.get(packageName));
}

test('apps/ui defines eas-build-post-install to re-apply native patches after expo prebuild', () => {
  const pkg = readRepoJson('apps/ui/package.json');
  const scripts = pkg?.scripts ?? {};
  assert.equal(typeof scripts, 'object', 'Expected package.json scripts object');

  // EAS Build executes `eas-build-post-install` once after npm/yarn install + `expo prebuild` (if needed).
  // We need this to ensure patch-package tasks run after the final dependency install step in EAS.
  assert.equal(
    typeof scripts['eas-build-post-install'],
    'string',
    'Expected apps/ui/package.json to define scripts.eas-build-post-install',
  );
  assert.match(
    scripts['eas-build-post-install'],
    /postinstall:real|tools\/postinstall\.mjs/,
    'Expected eas-build-post-install to invoke the existing UI postinstall implementation',
  );
});

test('apps/ui explicitly includes monorepo node_modules in Expo autolinking search paths', () => {
  const pkg = readRepoJson('apps/ui/package.json');
  const searchPaths = pkg?.expo?.autolinking?.searchPaths;
  assert.ok(Array.isArray(searchPaths), 'Expected apps/ui package.json to define expo.autolinking.searchPaths');

  assert.ok(
    searchPaths.includes('../../node_modules'),
    'Expected Expo autolinking to search the monorepo root node_modules for workspace native modules',
  );
  assert.ok(
    searchPaths.includes('./node_modules'),
    'Expected Expo autolinking to keep searching the app-local node_modules',
  );
});

test('first-party native Expo modules used by apps/ui declare complete autolinking metadata', () => {
  const nativeModules = findUiFirstPartyNativeExpoModules();

  for (const nativeModule of nativeModules) {
    assert.equal(
      typeof nativeModule.config.name,
      'string',
      `Expected ${nativeModule.packageName} to declare expo-module.config.json name`,
    );
    assert.notEqual(
      nativeModule.config.name.trim(),
      '',
      `Expected ${nativeModule.packageName} expo-module.config.json name to be non-empty`,
    );

    assert.ok(
      Array.isArray(nativeModule.config.platforms),
      `Expected ${nativeModule.packageName} to declare expo-module.config.json platforms`,
    );
    const declaredPlatforms = new Set(nativeModule.config.platforms);
    const platformBlocks = ['ios', 'android'].filter((platformName) => nativeModule.config[platformName]);
    for (const platformName of platformBlocks) {
      assert.ok(
        declaredPlatforms.has(platformName),
        `Expected ${nativeModule.packageName} platforms to include ${platformName}`,
      );
    }
  }
});

test('EAS build install scope includes first-party native Expo modules used by apps/ui', () => {
  const easJson = readRepoJson('apps/ui/eas.json');
  const scopeTokens = parseScopeTokens(easJson?.build?.base?.env?.HAPPIER_INSTALL_SCOPE);
  const nativeModules = findUiFirstPartyNativeExpoModules();

  for (const nativeModule of nativeModules) {
    const token = normalizeHappierWorkspaceToken(nativeModule.packageName);
    assert.ok(
      scopeTokens.has(token),
      `Expected HAPPIER_INSTALL_SCOPE to include ${token} so EAS builds do not skip native workspace setup`,
    );
  }
});
