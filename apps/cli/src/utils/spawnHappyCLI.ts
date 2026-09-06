/**
 * Cross-platform Happier CLI spawning utility
 * 
 * ## Background
 * 
 * We built a command-line JavaScript program with the entrypoint at `dist/index.mjs`.
 * This needs to be run with `node`, but we want to hide deprecation warnings and other 
 * noise from end users by passing specific flags: `--no-warnings --no-deprecation`.
 * 
 * Users don't care about these technical details - they just want a clean experience
 * with no warning output when using Happier.
 * 
 * ## The Wrapper Strategy
 * 
 * We created a wrapper script `bin/happier.mjs` with a shebang `#!/usr/bin/env node`.
 * This allows direct execution on Unix systems and NPM automatically generates 
 * Windows-specific wrapper scripts (`happier.cmd` and `happier.ps1`) when it sees 
 * the `bin` field in package.json pointing to a JavaScript file with a shebang.
 * 
 * The wrapper script either directly execs `dist/index.mjs` with the flags we want,
 * or imports it directly if Node.js already has the right flags.
 * 
 * ## Execution Chains
 * 
 * **Unix/Linux/macOS:**
 * 1. User runs `happier` command
 * 2. Shell directly executes `bin/happier.mjs` (shebang: `#!/usr/bin/env node`)
 * 3. `bin/happier.mjs` either execs `node --no-warnings --no-deprecation dist/index.mjs` or imports `dist/index.mjs` directly
 * 
 * **Windows:**
 * 1. User runs `happier` command  
 * 2. NPM wrapper (`happier.cmd`) calls `node bin/happier.mjs`
 * 3. `bin/happier.mjs` either execs `node --no-warnings --no-deprecation dist/index.mjs` or imports `dist/index.mjs` directly
 * 
 * ## The Spawning Problem
 * 
 * When our code needs to spawn Happier CLI as a subprocess (for daemon processes), 
 * we were trying to execute `bin/happier.mjs` directly. This fails on Windows 
 * because Windows doesn't understand shebangs - you get an `EFTYPE` error.
 * 
 * ## The Solution
 * 
 * Since we know exactly what needs to happen (run `dist/index.mjs` with specific 
 * Node.js flags), we can bypass all the wrapper layers and do it directly:
 * 
 * `spawn(process.execPath, ['--no-warnings', '--no-deprecation', 'dist/index.mjs', ...args])`
 * 
 * This works on all platforms and achieves the same result without any of the 
 * middleman steps that were providing workarounds for Windows vs Linux differences.
 */

import { spawn, SpawnOptions, type ChildProcess } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectPath } from '@/projectPath';
import { logger } from '@/ui/logger';
import { isBun } from './runtime';
import { createRequire } from 'node:module';
import { resolveJavaScriptRuntimeExecutable } from '@/runtime/js/resolveJavaScriptRuntimeExecutable';
import { buildMissingJavaScriptRuntimeMessage } from '@/runtime/js/buildMissingJavaScriptRuntimeMessage';
import { resolvePackagedRuntimeEntrypoint } from '@/runtime/resolvePackagedRuntimeEntrypoint';
import { parseOptionalBooleanEnv } from '@happier-dev/protocol';
import { isEmbeddedBunBundlePath } from '@/runtime/js/isEmbeddedBunBundlePath';
import {
  decidePinnedRunnerSnapshotPrune,
  type LiveRunnerSnapshotFingerprints,
} from './pinnedRunnerSnapshotPrune';
import { renameForPublicationSync } from './fs/renameForPublicationSync';

const STACK_RUNTIME_STATE_PATH_ENV = 'HAPPIER_CLI_SUBPROCESS_STACK_RUNTIME_STATE_PATH';
const STACK_DIST_ENTRYPOINT_ENV = 'HAPPIER_CLI_SUBPROCESS_DIST_ENTRYPOINT';
const DAEMON_DIST_CLOSURE_FINGERPRINT_ENV = 'HAPPIER_CLI_SUBPROCESS_DAEMON_DIST_CLOSURE_FINGERPRINT';
const RUNTIME_BACKED_SUBPROCESS_ENV = 'HAPPIER_CLI_SUBPROCESS_RUNTIME_BACKED';
const CLI_DIST_BUILD_MANIFEST = '.build-manifest.json';
const PINNED_RUNNER_DIST_DIR = '.runner-snapshots';
const PINNED_RUNNER_REQUIRED_ASSET_RELATIVE_PATHS = [
  ['scripts', 'terminal_launch_spec_runner.cjs'],
  ['scripts', 'claude_local_launcher.cjs'],
  ['scripts', 'claude_remote_launcher.cjs'],
  ['scripts', 'claude_launcher_runtime.cjs'],
  ['scripts', 'childProcessOptions.cjs'],
  ['scripts', 'ripgrep_launcher.cjs'],
  ['scripts', 'node_pty_relay.cjs'],
] as const;

function getSubprocessRuntime(): 'node' | 'bun' {
  const override = process.env.HAPPIER_CLI_SUBPROCESS_RUNTIME;
  if (override === 'node' || override === 'bun') return override;
  return isBun() ? 'bun' : 'node';
}

export function resolveTsxImportHookPath(): string | null {
  // `node --import tsx` resolves `tsx` relative to the current working directory.
  // Daemon-spawned sessions intentionally run in arbitrary `cwd`s (e.g. /Users/leeroy),
  // so we must use an absolute path to the tsx ESM register hook.
  try {
    const req = createRequire(import.meta.url);
    // Avoid package export maps by resolving package.json and building a file path.
    const pkgJsonPath = req.resolve('tsx/package.json');
    const pkgDir = dirname(pkgJsonPath);
    const hookPath = join(pkgDir, 'dist', 'esm', 'index.mjs');
    if (existsSync(hookPath)) return hookPath;
    return null;
  } catch {
    return null;
  }
}

export function toNodeImportSpecifier(importPath: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return pathToFileURL(importPath).href;
  }
  return importPath;
}

export function resolveTsxImportHookSpecifier(platform: NodeJS.Platform = process.platform): string | null {
  const hookPath = resolveTsxImportHookPath();
  if (!hookPath) {
    return null;
  }
  return toNodeImportSpecifier(hookPath, platform);
}

function resolveSubprocessEntrypoint(): string {
  const override = process.env.HAPPIER_CLI_SUBPROCESS_ENTRYPOINT;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return resolvePackagedRuntimeEntrypoint('index.mjs');
}

function resolveDevTsxFallbackEntrypoint(entrypoint: string): string {
  const distSegment = `${projectPath()}/dist/`;
  const normalized = entrypoint.replaceAll('\\', '/');
  if (normalized.startsWith(distSegment)) {
    return join(projectPath(), 'src', 'index.ts');
  }
  return join(projectPath(), 'src', 'index.ts');
}

export function resolveCliTsxTsconfigPath(): string {
  // The TSX loader resolves TS path aliases (`@/...`) using the tsconfig it finds.
  // Daemon-spawned subprocesses intentionally run in arbitrary `cwd`s, so TSX may
  // pick up the wrong tsconfig (or none) unless we provide an explicit path.
  //
  // TSX supports this via `TSX_TSCONFIG_PATH`, but we only want to set it for the
  // spawned subprocess, not mutate the parent process environment.
  return join(projectPath(), 'tsconfig.json');
}

function shouldAllowDevTsxFallback(): boolean {
  const explicit = parseOptionalBooleanEnv(process.env.HAPPIER_CLI_SUBPROCESS_ALLOW_TSX_FALLBACK);
  if (explicit !== null) return explicit;
  const isDevVariant = process.env.HAPPIER_VARIANT === 'dev';
  const hasStackContext = hasStackSubprocessContext();
  const hasDevSourceEntrypoint = existsSync(join(projectPath(), 'src', 'index.ts'));
  if (!isDevVariant && !hasStackContext && !hasDevSourceEntrypoint) return false;
  return true;
}

function hasStackSubprocessContext(env: Readonly<NodeJS.ProcessEnv> = process.env): boolean {
  return Boolean(
    env.HAPPIER_STACK_REPO_DIR ||
      env.HAPPIER_STACK_CLI_ROOT_DIR ||
      env.HAPPIER_STACK_STACK
  );
}

function shouldPreferDevTsxSubprocess(): boolean {
  if (typeof process.env.HAPPIER_CLI_SUBPROCESS_ENTRYPOINT === 'string' && process.env.HAPPIER_CLI_SUBPROCESS_ENTRYPOINT.trim().length > 0) {
    return false;
  }
  const explicitPreference = parseOptionalBooleanEnv(process.env.HAPPIER_CLI_SUBPROCESS_PREFER_TSX);
  if (explicitPreference !== null) return explicitPreference;
  return process.env.HAPPIER_VARIANT === 'dev' || hasStackSubprocessContext();
}

export type HappyCliSubprocessRuntime = 'node' | 'bun' | 'binary';

export type HappyCliSubprocessLaunchOptions = Readonly<{
  preferWindowsPackagedBinary?: boolean;
  allowAdmittedDaemonStartupClosure?: boolean;
  environment?: Readonly<NodeJS.ProcessEnv>;
  runtimeDecision?: HappyCliSubprocessRuntimeDecision;
  /**
   * Fingerprints of snapshot dirs referenced by LIVE session runners. Passed by the daemon spawn
   * path (the only caller that can enumerate live runners) so pinned-snapshot pruning never evicts
   * a snapshot out from under a running runner. Absent/unreliable => pruning fails closed and
   * deletes nothing (see `pinnedRunnerSnapshotPrune`).
   */
  liveRunnerSnapshotFingerprints?: LiveRunnerSnapshotFingerprints;
}>;

export type HappyCliSubprocessRuntimeDecision = Readonly<{
  runtime: 'node';
  argvPrefix: readonly string[];
  env?: Readonly<Record<string, string>>;
}>;

export type HappyCliSubprocessRuntimeInvocation = {
  runtime: Exclude<HappyCliSubprocessRuntime, 'binary'>;
  argv: string[];
  env?: Record<string, string>;
};

export type HappyCliSubprocessBinaryInvocation = {
  runtime: 'binary';
  filePath: string;
  argv: string[];
  env?: Record<string, string>;
};

export type HappyCliSubprocessInvocation =
  | HappyCliSubprocessRuntimeInvocation
  | HappyCliSubprocessBinaryInvocation;

export type HappyCliSubprocessLaunchSpec = {
  runtime: HappyCliSubprocessRuntime;
  filePath: string;
  args: string[];
  env?: Record<string, string>;
};

function isRuntimeExecutablePath(pathLike: string): boolean {
  const normalized = String(pathLike ?? '').trim().replaceAll('\\', '/');
  const base = normalized.split('/').at(-1)?.toLowerCase() ?? '';
  return base === 'node' || base === 'node.exe' || base === 'bun' || base === 'bun.exe';
}

function isCurrentProcessSelfContainedBinary(): boolean {
  const execPath = String(process.execPath ?? '').trim();
  if (!execPath) return false;
  return !isRuntimeExecutablePath(execPath);
}

function isCurrentProcessBundledBunExecutable(): boolean {
  const execPath = String(process.execPath ?? '').trim();
  if (!execPath) return false;
  const base = execPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
  return base === 'bun' || base === 'bun.exe';
}

function resolveCurrentProcessBundledScriptPath(): string | null {
  const scriptPath = String(process.argv[1] ?? '').trim();
  if (!scriptPath) return null;
  if (isEmbeddedBunBundlePath(scriptPath)) return scriptPath;
  const normalized = scriptPath.replaceAll('\\', '/');
  if (!existsSync(scriptPath)) return null;
  const lowered = normalized.toLowerCase();
  const base = basename(lowered);
  if (base.includes('happier')) return scriptPath;
  if (base === 'index.mjs' && (lowered.includes('/@happier-dev/cli/') || lowered.includes('/happier/'))) {
    return scriptPath;
  }
  return null;
}

function buildCurrentProcessBinaryFallbackInvocation(args: string[]): HappyCliSubprocessInvocation | null {
  if (!isCurrentProcessSelfContainedBinary()) return null;
  return {
    runtime: 'bun',
    argv: [...args],
  };
}

function resolveSiblingWindowsPackagedBinary(entrypoint: string): string | null {
  if (process.platform !== 'win32') return null;
  const distDir = dirname(entrypoint);
  if (basename(distDir).toLowerCase() !== 'package-dist') return null;
  const binaryPath = join(dirname(distDir), 'happier.exe');
  return existsSync(binaryPath) ? binaryPath : null;
}

function shouldUseWindowsPackagedBinary(options: HappyCliSubprocessLaunchOptions | undefined): boolean {
  if (!options?.preferWindowsPackagedBinary) return false;
  if (process.platform !== 'win32') return false;
  const enabled = parseOptionalBooleanEnv(process.env.HAPPIER_WINDOWS_SESSION_RUNNER_BINARY);
  return enabled !== false;
}

function buildWindowsPackagedBinaryInvocation(
  args: string[],
  entrypoint: string,
  options: HappyCliSubprocessLaunchOptions | undefined,
): HappyCliSubprocessInvocation | null {
  if (!shouldUseWindowsPackagedBinary(options)) return null;
  const binaryPath = resolveSiblingWindowsPackagedBinary(entrypoint);
  if (!binaryPath) return null;
  return {
    runtime: 'binary',
    filePath: binaryPath,
    argv: [...args],
  };
}

function buildCurrentProcessBundledBunFallbackInvocation(
  args: string[],
): HappyCliSubprocessInvocation | null {
  // Bun virtual bundle paths are process-local on Windows and can fail when reused
  // by detached/background children. Fail closed and require a stable entrypoint.
  if (process.platform === 'win32') return null;
  const bundledScriptPath = resolveCurrentProcessBundledScriptPath();
  if (!bundledScriptPath) return null;
  if (isCurrentProcessSelfContainedBinary()) {
    return {
      runtime: 'bun',
      argv: [...args],
    };
  }
  if (isCurrentProcessBundledBunExecutable()) {
    return {
      runtime: 'bun',
      argv: [bundledScriptPath, ...args],
    };
  }
  return null;
}

function resolveSubprocessRuntimeExecutable(runtime: Exclude<HappyCliSubprocessRuntime, 'binary'>): string {
  // Prefer the currently-running runtime binary when possible. This avoids PATH
  // issues on Windows (and GUI-launched shells) where `node`/`bun` may not resolve.
  if (runtime === 'node') {
    const javaScriptRuntime = resolveJavaScriptRuntimeExecutable({
      isBunRuntime: isBun(),
    });
    if (!javaScriptRuntime) {
      throw new ReferenceError(buildMissingJavaScriptRuntimeMessage('Kaiwu CLI subprocess'));
    }
    return javaScriptRuntime;
  }
  if (
    runtime === 'bun' &&
    (isBun() || isCurrentProcessSelfContainedBinary() || isCurrentProcessBundledBunExecutable())
  ) {
    return process.execPath;
  }
  return runtime;
}

function readInheritedNodeLaunchFlags(): string[] {
  const inherited = new Set<string>();
  for (const arg of process.execArgv) {
    if (arg === '--preserve-symlinks' || arg === '--preserve-symlinks-main') {
      inherited.add(arg);
    }
  }
  return [...inherited];
}

type CliDistBuildManifest = Readonly<{
  ok: boolean;
  reason: string;
  fingerprint: string | null;
}>;

function readNonEmptyEnv(
  name: string,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): string | null {
  const value = String(env[name] ?? '').trim();
  return value ? value : null;
}

function isRuntimeBackedSubprocess(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): boolean {
  return parseOptionalBooleanEnv(env[RUNTIME_BACKED_SUBPROCESS_ENV]) === true;
}

export class HappyCliImmutableRuntimeClosureError extends Error {
  readonly code = 'EIMMUTABLERUNNERCLOSURE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'HappyCliImmutableRuntimeClosureError';
  }
}

function readCliDistBuildManifest(entrypoint: string): CliDistBuildManifest {
  const normalizedEntrypoint = String(entrypoint ?? '').trim();
  if (!normalizedEntrypoint || !existsSync(normalizedEntrypoint)) {
    return { ok: false, reason: 'missing_entrypoint', fingerprint: null };
  }
  try {
    const manifest = JSON.parse(readFileSync(join(dirname(normalizedEntrypoint), CLI_DIST_BUILD_MANIFEST), 'utf8')) as {
      fingerprint?: unknown;
    };
    const fingerprint = String(manifest?.fingerprint ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{16}$/.test(fingerprint)) {
      return { ok: false, reason: 'invalid_build_manifest_fingerprint', fingerprint: null };
    }
    return { ok: true, reason: 'manifest', fingerprint };
  } catch {
    return { ok: false, reason: 'missing_or_invalid_build_manifest', fingerprint: null };
  }
}

function resolveStackRuntimeStatePath(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): string | null {
  const explicit = readNonEmptyEnv(STACK_RUNTIME_STATE_PATH_ENV, env);
  if (explicit) return explicit;

  const stackEnvFile = readNonEmptyEnv('HAPPIER_STACK_ENV_FILE', env);
  if (stackEnvFile) return join(dirname(stackEnvFile), 'stack.runtime.json');

  const homeDir = readNonEmptyEnv('HAPPIER_HOME_DIR', env) ?? readNonEmptyEnv('HAPPIER_STACK_CLI_HOME_DIR', env);
  if (homeDir && basename(homeDir) === 'cli') {
    return join(dirname(homeDir), 'stack.runtime.json');
  }

  const storageDir = readNonEmptyEnv('HAPPIER_STACK_STORAGE_DIR', env);
  const stackName = readNonEmptyEnv('HAPPIER_STACK_STACK', env);
  if (storageDir && stackName) return join(storageDir, stackName, 'stack.runtime.json');

  return null;
}

function readRuntimeStateDistClosureFingerprint(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): string | null {
  const runtimeStatePath = resolveStackRuntimeStatePath(env);
  if (!runtimeStatePath) return null;
  try {
    const runtimeState = JSON.parse(readFileSync(runtimeStatePath, 'utf8')) as {
      daemon?: { distClosureFingerprint?: unknown };
    };
    const fingerprint = String(runtimeState?.daemon?.distClosureFingerprint ?? '').trim();
    return fingerprint ? fingerprint : null;
  } catch {
    return null;
  }
}

function resolveStackDistEntrypoint(
  defaultEntrypoint: string,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): string {
  return readNonEmptyEnv(STACK_DIST_ENTRYPOINT_ENV, env) ?? defaultEntrypoint;
}

function isRelativePathInsideRoot(relativePath: string): boolean {
  return Boolean(
    relativePath &&
      relativePath !== '..' &&
      !relativePath.startsWith('../') &&
      !relativePath.startsWith('..\\') &&
      !relativePath.startsWith('/') &&
      !relativePath.startsWith('\\'),
  );
}

function readPinnedSnapshotReadyMarker(snapshotRoot: string, fingerprint: string): boolean {
  try {
    return readFileSync(join(snapshotRoot, '.fingerprint'), 'utf8').trim() === fingerprint;
  } catch {
    return false;
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string, options: { skipNames?: ReadonlySet<string> } = {}): void {
  if (!existsSync(sourceDir)) return;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (options.skipNames?.has(entry.name)) continue;
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath, options);
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function copyCliRuntimeAssetsToPinnedSnapshot(runtimeRoot: string, snapshotRoot: string): void {
  for (const assetDir of ['scripts', 'tools']) {
    copyDirectoryContents(join(runtimeRoot, assetDir), join(snapshotRoot, assetDir));
  }
}

function hasPinnedSnapshotRuntimeAssets(snapshotRoot: string): boolean {
  return PINNED_RUNNER_REQUIRED_ASSET_RELATIVE_PATHS.every((relativePath) => (
    existsSync(join(snapshotRoot, ...relativePath))
  ));
}

function ensurePinnedSnapshotRuntimeAssets(runtimeRoot: string, snapshotRoot: string): boolean {
  if (!hasPinnedSnapshotRuntimeAssets(snapshotRoot)) {
    copyCliRuntimeAssetsToPinnedSnapshot(runtimeRoot, snapshotRoot);
  }
  return hasPinnedSnapshotRuntimeAssets(snapshotRoot);
}

function resolvePinnedSnapshotLocation(entrypoint: string, fingerprint: string): {
  runtimeRoot: string;
  snapshotsDir: string;
  snapshotRoot: string;
  snapshotEntrypoint: string;
} | null {
  const distRoot = dirname(entrypoint);
  const entrypointRelativePath = relative(distRoot, entrypoint);
  if (!isRelativePathInsideRoot(entrypointRelativePath)) return null;

  const runtimeRoot = dirname(distRoot);
  const snapshotsDir = join(runtimeRoot, PINNED_RUNNER_DIST_DIR);
  const snapshotRoot = join(snapshotsDir, fingerprint);
  return {
    runtimeRoot,
    snapshotsDir,
    snapshotRoot,
    snapshotEntrypoint: join(snapshotRoot, entrypointRelativePath),
  };
}

let warnedOnceAboutUnreliableSnapshotLiveness = false;

/**
 * Liveness-aware retention for pinned runner dist snapshots.
 *
 * Deletion is gated on a reliable set of LIVE-runner fingerprints (`live`). Absent/unreliable
 * liveness fails closed (deletes nothing) because evicting a snapshot referenced by a running
 * runner turns its next bundled-tool spawn into an ENOENT — the 2026-07-10 session-killer.
 */
function prunePinnedRunnerSnapshots(
  snapshotsDir: string,
  keepFingerprint: string,
  live: LiveRunnerSnapshotFingerprints | null | undefined,
  keepCount = 8,
): void {
  try {
    if (!existsSync(snapshotsDir)) return;
    const entries = readdirSync(snapshotsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const fullPath = join(snapshotsDir, entry.name);
        let mtimeMs = 0;
        try {
          mtimeMs = Number(statSync(fullPath).mtimeMs) || 0;
        } catch {
          mtimeMs = 0;
        }
        return { name: entry.name, fullPath, mtimeMs };
      });

    const decision = decidePinnedRunnerSnapshotPrune({
      entries: entries.map((entry) => ({ name: entry.name, mtimeMs: entry.mtimeMs })),
      keepFingerprint,
      live,
      keepCount,
    });

    if (decision.skipped === 'live_data_unreliable' && !warnedOnceAboutUnreliableSnapshotLiveness) {
      warnedOnceAboutUnreliableSnapshotLiveness = true;
      logger.warn(
        '[SPAWN HAPPIER CLI] Skipping pinned dist runner snapshot pruning: live-runner fingerprints unavailable/unreliable; retaining all snapshots to avoid evicting a live runner.',
      );
    }
    if (decision.deletable.length < 1) return;

    const fullPathByName = new Map(entries.map((entry) => [entry.name, entry.fullPath]));
    for (const name of decision.deletable) {
      const fullPath = fullPathByName.get(name);
      if (fullPath) rmSync(fullPath, { recursive: true, force: true });
    }
  } catch (error) {
    logger.debug(`[SPAWN HAPPIER CLI] Could not prune pinned dist runner snapshots: ${String(error)}`);
  }
}

/**
 * Apply pinned-runner retention once the daemon has completed its authoritative startup reattach
 * scan. This closes the no-session growth gap: machines that only run the daemon still prune dead
 * historical closures without weakening the fail-closed live-runner invariant.
 */
export function pruneHappyCliRunnerSnapshots(
  live: LiveRunnerSnapshotFingerprints,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const daemonFingerprint = readNonEmptyEnv(DAEMON_DIST_CLOSURE_FINGERPRINT_ENV, environment);
  if (!daemonFingerprint) return;

  const distEntrypoint = resolveStackDistEntrypoint(resolveSubprocessEntrypoint(), environment);
  const location = resolvePinnedSnapshotLocation(distEntrypoint, daemonFingerprint);
  if (!location) return;
  prunePinnedRunnerSnapshots(location.snapshotsDir, daemonFingerprint, live);
}

function copyCliDistToPinnedSnapshot(
  entrypoint: string,
  fingerprint: string,
  live: LiveRunnerSnapshotFingerprints | null | undefined,
): string | null {
  const distRoot = dirname(entrypoint);
  const location = resolvePinnedSnapshotLocation(entrypoint, fingerprint);
  if (!location) return null;
  const {
    runtimeRoot,
    snapshotsDir,
    snapshotRoot,
    snapshotEntrypoint,
  } = location;
  if (readPinnedSnapshotReadyMarker(snapshotRoot, fingerprint) && existsSync(snapshotEntrypoint)) {
    prunePinnedRunnerSnapshots(snapshotsDir, fingerprint, live);
    return ensurePinnedSnapshotRuntimeAssets(runtimeRoot, snapshotRoot) ? snapshotEntrypoint : null;
  }

  const tmpRoot = join(snapshotsDir, `.${fingerprint}.${process.pid}.${Date.now()}.tmp`);
  try {
    mkdirSync(snapshotsDir, { recursive: true });
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });

    copyDirectoryContents(distRoot, tmpRoot, { skipNames: new Set([PINNED_RUNNER_DIST_DIR]) });

    copyCliRuntimeAssetsToPinnedSnapshot(runtimeRoot, tmpRoot);
    writeFileSync(join(tmpRoot, '.fingerprint'), `${fingerprint}\n`, 'utf8');
    try {
      renameForPublicationSync(tmpRoot, snapshotRoot);
    } catch {
      if (
        !readPinnedSnapshotReadyMarker(snapshotRoot, fingerprint)
        || !existsSync(snapshotEntrypoint)
        || !ensurePinnedSnapshotRuntimeAssets(runtimeRoot, snapshotRoot)
      ) {
        throw new Error(`pinned dist snapshot was not ready: ${snapshotRoot}`);
      }
      rmSync(tmpRoot, { recursive: true, force: true });
    }

    const ready = readPinnedSnapshotReadyMarker(snapshotRoot, fingerprint)
      && existsSync(snapshotEntrypoint)
      && ensurePinnedSnapshotRuntimeAssets(runtimeRoot, snapshotRoot);
    if (ready) {
      prunePinnedRunnerSnapshots(snapshotsDir, fingerprint, live);
      return snapshotEntrypoint;
    }
    return null;
  } catch (error) {
    rmSync(tmpRoot, { recursive: true, force: true });
    logger.debug(`[SPAWN HAPPIER CLI] Could not prepare pinned dist runner closure: ${String(error)}`);
    return null;
  }
}

function buildCurrentStackDistSubprocessInvocation(
  args: string[],
  defaultEntrypoint: string,
  options: HappyCliSubprocessLaunchOptions | undefined,
): HappyCliSubprocessInvocation | null {
  const env = options?.environment ?? process.env;
  if (!hasStackSubprocessContext(env)) return null;
  const runtimeBacked = isRuntimeBackedSubprocess(env);
  const daemonFingerprint = readNonEmptyEnv(DAEMON_DIST_CLOSURE_FINGERPRINT_ENV, env);
  if (!daemonFingerprint) return null;
  if (!runtimeBacked) {
    const runtimeFingerprint = readRuntimeStateDistClosureFingerprint(env);
    const isInitialDaemonStartup = (
      options?.allowAdmittedDaemonStartupClosure === true
      && args[0] === 'daemon'
      && args[1] === 'start-sync'
    );
    if (
      (!runtimeFingerprint || runtimeFingerprint !== daemonFingerprint)
      && !isInitialDaemonStartup
    ) {
      return null;
    }
  }

  const distEntrypoint = resolveStackDistEntrypoint(defaultEntrypoint, env);
  const admittedSnapshot = resolvePinnedSnapshotLocation(distEntrypoint, daemonFingerprint);
  if (
    admittedSnapshot
    && readPinnedSnapshotReadyMarker(admittedSnapshot.snapshotRoot, daemonFingerprint)
    && existsSync(admittedSnapshot.snapshotEntrypoint)
    && ensurePinnedSnapshotRuntimeAssets(
      admittedSnapshot.runtimeRoot,
      admittedSnapshot.snapshotRoot,
    )
  ) {
    prunePinnedRunnerSnapshots(
      admittedSnapshot.snapshotsDir,
      daemonFingerprint,
      options?.liveRunnerSnapshotFingerprints,
    );
    return {
      runtime: 'node',
      argv: [
        ...readInheritedNodeLaunchFlags(),
        '--no-warnings',
        '--no-deprecation',
        admittedSnapshot.snapshotEntrypoint,
        ...args,
      ],
    };
  }

  const distManifest = readCliDistBuildManifest(distEntrypoint);
  if (!distManifest.ok || !distManifest.fingerprint || distManifest.fingerprint !== daemonFingerprint) {
    return null;
  }
  const pinnedEntrypoint = copyCliDistToPinnedSnapshot(
    distEntrypoint,
    distManifest.fingerprint,
    options?.liveRunnerSnapshotFingerprints,
  );
  if (!pinnedEntrypoint) return null;

  // Source daemons intentionally keep hot-reload correctness: once the stack records
  // a different dist fingerprint, this fast path stops and tsx runs source until the
  // next daemon env carries the new fingerprint. Each child uses a copied closure so
  // a concurrent dist replacement cannot mix old and new files during boot.
  return {
    runtime: 'node',
    argv: [
      ...readInheritedNodeLaunchFlags(),
      '--no-warnings',
      '--no-deprecation',
      pinnedEntrypoint,
      ...args,
    ],
  };
}

function buildDevTsxSubprocessInvocation(args: string[], entrypoint: string): HappyCliSubprocessInvocation | null {
  const tsxEntrypoint = resolveDevTsxFallbackEntrypoint(entrypoint);
  if (!existsSync(tsxEntrypoint)) return null;
  const tsxHookSpecifier = resolveTsxImportHookSpecifier();
  if (!tsxHookSpecifier) {
    const errorMessage = `tsx is required for TSX fallback but could not be resolved from the cli package`;
    logger.debug(`[SPAWN HAPPIER CLI] ${errorMessage}`);
    throw new Error(errorMessage);
  }
  return {
    runtime: 'node',
    argv: ['--no-warnings', '--no-deprecation', '--import', tsxHookSpecifier, tsxEntrypoint, ...args],
    env: { TSX_TSCONFIG_PATH: resolveCliTsxTsconfigPath() },
  };
}

export function buildHappyCliSubprocessInvocation(
  args: string[],
  options?: HappyCliSubprocessLaunchOptions,
): HappyCliSubprocessInvocation {
  if (options?.runtimeDecision) {
    return {
      runtime: options.runtimeDecision.runtime,
      argv: [...options.runtimeDecision.argvPrefix, ...args],
      ...(options.runtimeDecision.env ? { env: { ...options.runtimeDecision.env } } : {}),
    };
  }

  const entrypoint = resolveSubprocessEntrypoint();
  const runtime = getSubprocessRuntime();

  if (runtime === 'node' && shouldPreferDevTsxSubprocess()) {
    const environment = options?.environment ?? process.env;
    const explicitTsxPreference = parseOptionalBooleanEnv(environment.HAPPIER_CLI_SUBPROCESS_PREFER_TSX);
    if (explicitTsxPreference !== true) {
      const currentStackDistInvocation = buildCurrentStackDistSubprocessInvocation(args, entrypoint, options);
      if (currentStackDistInvocation) return currentStackDistInvocation;
      if (
        options?.allowAdmittedDaemonStartupClosure === true
        && args[0] === 'daemon'
        && args[1] === 'start-sync'
      ) {
        throw new HappyCliImmutableRuntimeClosureError(
          'Stack daemon startup could not prepare its admitted immutable dist closure.',
        );
      }
    }
    if (isRuntimeBackedSubprocess()) {
      throw new HappyCliImmutableRuntimeClosureError(
        'Runtime-backed Kaiwu CLI runner requires its admitted immutable dist closure; mutable source fallback is disabled.',
      );
    }
    const tsxInvocation = buildDevTsxSubprocessInvocation(args, entrypoint);
    if (tsxInvocation) return tsxInvocation;
  }

  if (isRuntimeBackedSubprocess()) {
    throw new HappyCliImmutableRuntimeClosureError(
      'Runtime-backed Kaiwu CLI runner could not resolve its admitted immutable dist closure.',
    );
  }

  if (runtime === 'node') {
    const windowsBinaryInvocation = buildWindowsPackagedBinaryInvocation(args, entrypoint, options);
    if (windowsBinaryInvocation) return windowsBinaryInvocation;
  }

  // Use the same Node.js flags that the wrapper script uses
  const inheritedNodeLaunchFlags = runtime === 'node' ? readInheritedNodeLaunchFlags() : [];
  const nodeArgs = [
    ...inheritedNodeLaunchFlags,
    '--no-warnings',
    '--no-deprecation',
    entrypoint,
    ...args
  ];

  // Sanity check of the entrypoint path exists
  if (!existsSync(entrypoint)) {
    const currentProcessBundledBunFallback = buildCurrentProcessBundledBunFallbackInvocation(args);
    if (currentProcessBundledBunFallback) {
      return currentProcessBundledBunFallback;
    }

    const currentProcessBinaryFallback = buildCurrentProcessBinaryFallbackInvocation(args);
    if (currentProcessBinaryFallback) {
      return currentProcessBinaryFallback;
    }

    const allowTsxFallback = shouldAllowDevTsxFallback();
    if (runtime === 'node' && allowTsxFallback) {
      const tsxInvocation = buildDevTsxSubprocessInvocation(args, entrypoint);
      if (tsxInvocation) return tsxInvocation;
    }
    if (runtime === 'bun') {
      if (isCurrentProcessSelfContainedBinary()) {
        return { runtime: 'bun', argv: [...args] };
      }
      const bundledScriptPath = resolveCurrentProcessBundledScriptPath();
      if (bundledScriptPath) {
        return { runtime: 'bun', argv: [bundledScriptPath, ...args] };
      }
    }
    const errorMessage = `Entrypoint ${entrypoint} does not exist`;
    logger.debug(`[SPAWN HAPPIER CLI] ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const argv = runtime === 'node' ? nodeArgs : [entrypoint, ...args];
  return { runtime, argv };
}

export function resolveHappyCliSubprocessRuntimeDecision(
  options?: Omit<HappyCliSubprocessLaunchOptions, 'runtimeDecision'>,
): HappyCliSubprocessRuntimeDecision | null {
  if (!isRuntimeBackedSubprocess()) return null;
  const invocation = buildHappyCliSubprocessInvocation([], options);
  if (invocation.runtime !== 'node') {
    throw new HappyCliImmutableRuntimeClosureError(
      'Runtime-backed Kaiwu CLI runner did not resolve to the admitted Node.js closure.',
    );
  }
  return {
    runtime: 'node',
    argvPrefix: [...invocation.argv],
    ...(invocation.env ? { env: { ...invocation.env } } : {}),
  };
}

export function buildHappyCliSubprocessLaunchSpec(
  args: string[],
  options?: HappyCliSubprocessLaunchOptions,
): HappyCliSubprocessLaunchSpec {
  const invocation = buildHappyCliSubprocessInvocation(args, options);
  if (invocation.runtime === 'binary') {
    return {
      runtime: invocation.runtime,
      filePath: invocation.filePath,
      args: invocation.argv,
      env: invocation.env,
    };
  }
  return {
    runtime: invocation.runtime,
    filePath: resolveSubprocessRuntimeExecutable(invocation.runtime),
    args: invocation.argv,
    env: invocation.env,
  };
}

/**
 * Spawn the Happier CLI with the given arguments in a cross-platform way.
 * 
 * This function bypasses the wrapper script (bin/happier.mjs) and spawns the 
 * actual CLI entrypoint (dist/index.mjs) directly with Node.js, ensuring
 * compatibility across all platforms including Windows.
 * 
 * @param args - Arguments to pass to the Happier CLI
 * @param options - Spawn options (same as child_process.spawn)
 * @returns ChildProcess instance
 */
export function spawnHappyCLI(
  args: string[],
  options: SpawnOptions = {},
  launchOptions?: HappyCliSubprocessLaunchOptions,
): ChildProcess {
  let directory: string | URL | undefined;
  if ('cwd' in options) {
    directory = options.cwd
  } else {
    directory = process.cwd()
  }
  // Note: We're actually executing 'node' with the calculated entrypoint path below,
  // bypassing the 'happier' wrapper that would normally be found in the shell's PATH.
  // However, we log it as 'happier' here because other engineers are typically looking
  // for when "happier" was started and don't care about the underlying node process
  // details and flags we use to achieve the same result.
  const fullCommand = `happier ${args.join(' ')}`;
  logger.debug(`[SPAWN HAPPIER CLI] Spawning: ${fullCommand} in ${directory}`);

  const launchSpec = buildHappyCliSubprocessLaunchSpec(args, launchOptions);
  const spawnOptions: SpawnOptions = launchSpec.env
    ? { ...options, env: { ...(options.env ?? process.env), ...launchSpec.env } }
    : options;
  return spawn(launchSpec.filePath, launchSpec.args, spawnOptions);
}
