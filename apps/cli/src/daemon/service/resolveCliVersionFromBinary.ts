/**
 * Resolve the version string of a Happier CLI installation by spawning the
 * installed binary with `--version`. Shared across:
 *
 * - `resolveDaemonServiceInventoryEntries` (daemon/service/cli.ts) — fills
 *   `configuredCliVersion` on background-service inventory rows.
 * - `buildCurrentCliInfo` (diagnostics/doctorRepair/resolveDoctorRepairReport.ts)
 *   — resolves the version of the CLI actually installed at the path launchd
 *   will exec, which may differ from the repo-bundled version when invoked
 *   from a local-dev build.
 *
 * Having one implementation is the point: anywhere we're reading a version
 * from an installed binary path, we go through this helper — no parallel
 * realpath-parsers or package.json readers drifting apart.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { buildServiceCommandEnv } from '@happier-dev/cli-common/service';

export const CLI_SEMVER_REGEXP =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidCliSemver(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  return CLI_SEMVER_REGEXP.test(s);
}

export type ProbeCliVersionResult =
  | Readonly<{ ok: true; version: string }>
  | Readonly<{ ok: false; reason: string }>;

export function probeCliVersion(params: Readonly<{
  nodePath: string;
  entryPath?: string | null;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  expectedVersion?: string | null;
  processEnv?: NodeJS.ProcessEnv;
}>): ProbeCliVersionResult {
  const nodePath = String(params.nodePath ?? '').trim();
  if (!nodePath) {
    return { ok: false, reason: 'nodePath is required' };
  }
  if (!existsSync(nodePath)) {
    return { ok: false, reason: `Executable does not exist: ${nodePath}` };
  }

  const entryPath = String(params.entryPath ?? '').trim();
  if (entryPath && !existsSync(entryPath)) {
    return { ok: false, reason: `Entrypoint does not exist: ${entryPath}` };
  }

  const platform = params.platform ?? process.platform;
  const timeout = params.timeoutMs ?? 3000;
  const cmdArgs = entryPath ? [entryPath, '--version'] : ['--version'];
  const env = params.processEnv ?? process.env;

  try {
    let res = spawnSync(nodePath, cmdArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      env: buildServiceCommandEnv({ cmd: nodePath, args: cmdArgs, env }),
    });
    if (res.status !== 0 && platform !== 'win32' && !entryPath) {
      res = spawnSync('bash', [nodePath, '--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
        env: buildServiceCommandEnv({ cmd: 'bash', args: [nodePath, '--version'], env }),
      });
    }
    if (res.status !== 0) {
      const stderr = String(res.stderr ?? '').trim().slice(0, 200);
      return {
        ok: false,
        reason: `Command exited with status ${res.status ?? 'null'}${stderr ? `: ${stderr}` : ''}`,
      };
    }
    const firstLine = String(res.stdout ?? '').trim().split(/\r?\n/u)[0]?.trim();
    if (!firstLine) {
      return { ok: false, reason: 'Empty stdout returned for --version' };
    }
    if (!isValidCliSemver(firstLine)) {
      return { ok: false, reason: `Invalid semver format: "${firstLine}"` };
    }
    if (params.expectedVersion) {
      const normActual = firstLine.replace(/^v/i, '');
      const normExpected = String(params.expectedVersion).trim().replace(/^v/i, '');
      if (normActual !== normExpected) {
        return {
          ok: false,
          reason: `Version mismatch: candidate returned ${normActual}, expected ${normExpected}`,
        };
      }
    }
    return { ok: true, version: firstLine };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Spawn `<binaryPath> --version` and return the first trimmed non-empty line
 * of stdout. Falls back to invoking via `bash` on unix when the direct exec
 * returns non-zero (handles scripts or variants where the shebang isn't
 * respected). Returns null on any failure — missing binary, non-zero exit,
 * timeout, or empty output.
 */
export function resolveCliVersionFromBinary(params: Readonly<{
  binaryPath: string;
  platform: NodeJS.Platform;
  timeoutMs?: number;
}>): string | null {
  const binaryPath = String(params.binaryPath ?? '').trim();
  if (!binaryPath) return null;
  const probe = probeCliVersion({
    nodePath: binaryPath,
    platform: params.platform,
    timeoutMs: params.timeoutMs,
  });
  return probe.ok ? probe.version : null;
}
