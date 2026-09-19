import type { HappyCliSubprocessLaunchSpec } from '@/utils/spawnHappyCLI';
import { buildHappyCliSubprocessLaunchSpec } from '@/utils/spawnHappyCLI';

import type {
  SessionRunnerEntrypointIdentity,
  SessionRunnerEntrypointIdentitySource,
  UnknownSessionRunnerEntrypointIdentity,
} from './types';

function unknownIdentity(reason: UnknownSessionRunnerEntrypointIdentity['reason']): SessionRunnerEntrypointIdentity {
  return {
    status: 'unknown',
    source: 'unknown',
    reason,
  };
}

function normalizePathLike(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+/g, '/');
}

function normalizeComparablePath(value: string): string {
  return normalizePathLike(value).replace(/\/+$/, '').toLowerCase();
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const char of command) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isMutableEntrypointPointer(pathLike: string): boolean {
  const normalized = normalizePathLike(pathLike).toLowerCase();
  return /(?:^|\/)(current|previous)(?:\/|$)/.test(normalized);
}

/**
 * Pinned dist runner snapshots (`spawnHappyCLI.ts#copyCliDistToPinnedSnapshot`) copy the dist
 * closure into `.runner-snapshots/<distClosureFingerprint>/` with the entrypoint at the snapshot
 * root (`<fingerprint>/index.mjs`, no `/dist/` segment). The fingerprint directory is
 * content-addressed and immutable, so it IS the code generation: equal fingerprints attest the
 * same build, different fingerprints attest different builds. This was the 2026-07-10 zero-roll
 * root cause — snapshot entrypoints resolved to `entrypoint_not_found`, so every rollout pass
 * skipped every runner with `current_entrypoint_unknown`.
 */
function resolveRunnerSnapshotFingerprint(pathLike: string): string | null {
  const normalized = normalizeComparablePath(pathLike);
  const match = /\/\.runner-snapshots\/([^/]+)\//.exec(`${normalized}/`);
  const fingerprint = match?.[1]?.trim() ?? '';
  if (!fingerprint || fingerprint.startsWith('.')) return null;
  return fingerprint;
}

function isCliEntrypointPath(pathLike: string): boolean {
  const normalized = normalizePathLike(pathLike).toLowerCase();
  if (
    normalized.endsWith('/package-dist/index.mjs') ||
    normalized.endsWith('/dist/index.mjs') ||
    normalized.endsWith('/src/index.ts')
  ) {
    return true;
  }
  return normalized.endsWith('/index.mjs') && resolveRunnerSnapshotFingerprint(normalized) !== null;
}

function isCliBinaryPath(pathLike: string): boolean {
  const base = normalizePathLike(pathLike).split('/').at(-1)?.toLowerCase() ?? '';
  return base === 'kaiwu' || base === 'kaiwu.exe' || base === 'happier' || base === 'happier.exe';
}

function resolveVersion(pathLike: string): string | null {
  const normalized = normalizePathLike(pathLike);
  const match = /(?:^|\/)versions\/([^/]+)(?:\/|$)/i.exec(normalized);
  const version = match?.[1]?.trim() ?? '';
  return version || null;
}

function resolveRuntimeRoot(pathLike: string): string | null {
  const normalized = normalizeComparablePath(pathLike);
  for (const marker of ['/package-dist/', '/dist/', '/src/']) {
    const index = normalized.indexOf(marker);
    if (index > 0) return normalized.slice(0, index);
  }
  if (isCliBinaryPath(normalized)) {
    const parts = normalized.split('/');
    parts.pop();
    return parts.join('/') || null;
  }
  return null;
}

function resolveEntrypointPathIdentity(
  pathLike: string,
  source: Exclude<SessionRunnerEntrypointIdentitySource, 'structured_state' | 'unknown'>,
): SessionRunnerEntrypointIdentity {
  const normalized = normalizePathLike(pathLike);
  if (!normalized) return unknownIdentity('entrypoint_not_found');
  if (isMutableEntrypointPointer(normalized)) return unknownIdentity('mutable_entrypoint_pointer');

  const version = resolveVersion(normalized);
  if (version) {
    return {
      status: 'known',
      source,
      comparableId: `version:${version}`,
      entrypointVersion: version,
    };
  }

  const snapshotFingerprint = resolveRunnerSnapshotFingerprint(normalized);
  if (snapshotFingerprint) {
    return {
      status: 'known',
      source,
      comparableId: `snapshot:${snapshotFingerprint}`,
      entrypointVersion: null,
    };
  }

  const root = resolveRuntimeRoot(normalized);
  if (!root) return unknownIdentity('entrypoint_not_found');
  return {
    status: 'known',
    source,
    comparableId: `path:${root}`,
    entrypointVersion: null,
  };
}

/**
 * Whether equality of two comparable ids proves the SAME code generation.
 *
 * `version:` (immutable install dir) and `snapshot:` (content-addressed dist closure) ids attest
 * their generation. Bare `path:` ids point at MUTABLE roots (tsx source trees, in-place-rebuilt
 * dist): the process froze whatever the path contained at spawn, so path equality proves nothing
 * about the running generation and must never classify a runner as `current`/`already_current`.
 */
export function isGenerationAttestedComparableId(comparableId: string): boolean {
  return comparableId.startsWith('version:') || comparableId.startsWith('snapshot:');
}

function findEntrypointToken(tokens: readonly string[]): string | null {
  const candidates = tokens.filter((token) => isCliEntrypointPath(token) || isCliBinaryPath(token));
  return candidates.at(-1) ?? null;
}

export function resolveSessionRunnerEntrypointIdentityFromProcessCommand(
  processCommand: string | null | undefined,
): SessionRunnerEntrypointIdentity {
  const command = typeof processCommand === 'string' ? processCommand.trim() : '';
  if (!command) return unknownIdentity('empty_command');

  const tokens = tokenizeCommandLine(command);
  const entrypoint = findEntrypointToken(tokens);
  if (!entrypoint) {
    if (isMutableEntrypointPointer(command)) return unknownIdentity('mutable_entrypoint_pointer');
    return unknownIdentity('entrypoint_not_found');
  }
  return resolveEntrypointPathIdentity(entrypoint, 'process_command');
}

export function resolveEntrypointIdentityFromLaunchSpec(
  launchSpec: HappyCliSubprocessLaunchSpec | null | undefined,
): SessionRunnerEntrypointIdentity {
  if (!launchSpec) return unknownIdentity('empty_launch_spec');
  const candidates = launchSpec.runtime === 'binary'
    ? [launchSpec.filePath]
    : launchSpec.args;
  const entrypoint = findEntrypointToken(candidates);
  if (!entrypoint && launchSpec.runtime === 'binary') {
    return resolveEntrypointPathIdentity(launchSpec.filePath, 'launch_spec');
  }
  if (!entrypoint) return unknownIdentity('entrypoint_not_found');
  return resolveEntrypointPathIdentity(entrypoint, 'launch_spec');
}

export function resolveCurrentSessionRunnerLaunchIdentity(): SessionRunnerEntrypointIdentity {
  return resolveEntrypointIdentityFromLaunchSpec(buildHappyCliSubprocessLaunchSpec([]));
}
