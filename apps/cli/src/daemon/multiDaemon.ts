import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createServerUrlComparableKey } from '@happier-dev/protocol';
import { decodeJwtPayload } from '@/cloud/decodeJwtPayload';
import { configuration } from '@/configuration';
import { resolveDaemonStartupSourceServiceManagedState } from '@/daemon/ownership/daemonOwnershipMetadata';
import { DaemonLocallyPersistedStateSchema, readSettings } from '@/persistence';
import { logger } from '@/ui/logger';
import { resolveDaemonServiceInstallationSnapshotFromEnv } from '@/daemon/service/cli';
import { resolveDaemonStateCandidatePaths } from '@/daemon/ownership/daemonOwnershipPaths';
import { resolveMachineIdForServerFromSettings } from '@/daemon/resolveMachineIdForServerFromSettings';
import type { DaemonStartupSource } from '@/daemon/ownership/daemonOwnershipMetadata';
import { isPidAliveBySignal } from '@/daemon/processRunState';
type NormalizedDaemonState = Readonly<{
  pid: number;
  httpPort: number;
  startedAt: number;
  startedWithCliVersion: string;
  controlToken?: string;
  startupSource?: DaemonStartupSource;
  serviceLabel?: string;
}>;

type StopDaemonOptions = Readonly<{
  stopSessions?: boolean;
}>;

type SameHomeDaemonStateRecord = Readonly<{
  serverId: string;
  statePath: string;
  state: NormalizedDaemonState;
}>;

export type SameHomeDaemonOrphanReapResult = Readonly<{
  stoppedPids: readonly number[];
  preservedPids: readonly number[];
  failedPids: readonly number[];
}>;

function parseDaemonStateFromJson(value: unknown): NormalizedDaemonState | null {
  const parsed = DaemonLocallyPersistedStateSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data as any;
  if (typeof data.pid !== 'number' || typeof data.httpPort !== 'number') return null;
  if ('startedAt' in data) {
    return {
      pid: data.pid,
      httpPort: data.httpPort,
      startedAt: data.startedAt,
      startedWithCliVersion: data.startedWithCliVersion,
      controlToken: typeof data.controlToken === 'string' ? data.controlToken : undefined,
      startupSource: typeof data.startupSource === 'string' ? data.startupSource : undefined,
      serviceLabel: typeof data.serviceLabel === 'string' ? data.serviceLabel : undefined,
    };
  }
  const startedAt = Date.parse(String(data.startTime ?? ''));
  return {
    pid: data.pid,
    httpPort: data.httpPort,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    startedWithCliVersion: data.startedWithCliVersion,
  };
}

const isPidAlive = isPidAliveBySignal;

async function readDaemonStateFromPath(path: string): Promise<NormalizedDaemonState | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    return parseDaemonStateFromJson(raw);
  } catch (error) {
    logger.debug(`[multi-daemon] failed to read daemon state: ${path}`, error);
    return null;
  }
}

async function resolveDaemonStatePath(serverId: string): Promise<string> {
  const serverDir = join(configuration.serversDir, serverId);
  const [canonicalPath, ...legacyPaths] = resolveDaemonStateCandidatePaths({
    serverDir,
    preferredRing: configuration.publicReleaseRing,
  });
  let firstReadablePath: string | null = null;
  for (const candidatePath of [canonicalPath, ...legacyPaths]) {
    if (!existsSync(candidatePath)) {
      continue;
    }
    const state = await readDaemonStateFromPath(candidatePath);
    if (!state) {
      continue;
    }
    if (isPidAlive(state.pid)) {
      return candidatePath;
    }
    if (!firstReadablePath) {
      firstReadablePath = candidatePath;
    }
  }
  return firstReadablePath ?? canonicalPath;
}

async function listSameHomeServerIds(): Promise<string[]> {
  const settings = await readSettings();
  const serverIds = new Set<string>(Object.keys(settings.servers ?? {}));
  const activeServerId = String(configuration.activeServerId ?? '').trim();
  if (activeServerId) {
    serverIds.add(activeServerId);
  }

  try {
    const entries = await readdir(configuration.serversDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.trim()) {
        serverIds.add(entry.name);
      }
    }
  } catch {
    // Missing servers dir is fine for fresh homes.
  }

  return [...serverIds].sort();
}

async function listSameHomeDaemonStateRecords(): Promise<SameHomeDaemonStateRecord[]> {
  const records: SameHomeDaemonStateRecord[] = [];
  const seenPaths = new Set<string>();
  for (const serverId of await listSameHomeServerIds()) {
    const serverDir = join(configuration.serversDir, serverId);
    for (const statePath of resolveDaemonStateCandidatePaths({
      serverDir,
      preferredRing: configuration.publicReleaseRing,
    })) {
      if (seenPaths.has(statePath)) {
        continue;
      }
      seenPaths.add(statePath);
      const state = await readDaemonStateFromPath(statePath);
      if (!state) {
        continue;
      }
      records.push({ serverId, statePath, state });
    }
  }
  return records;
}

export type DaemonStatusEntry = Readonly<{
  serverId: string;
  name: string;
  serverUrl: string;
  comparableKey: string | null;
  daemonStatePath: string;
  auth?: Readonly<{
    authenticated: boolean;
    needsAuth: boolean;
    machineRegistered: boolean;
    machineId: string | null;
    accountId: string | null;
  }>;
  drift?: Readonly<{
    activeComparableKey: string | null;
    matchesActiveRelay: boolean | null;
  }>;
  service: Readonly<{
    installed: boolean;
    running?: boolean;
    platform?: string;
    installedPath?: string;
  }>;
  daemon: Readonly<{
    pid: number | null;
    httpPort: number | null;
    running: boolean;
    staleStateFile: boolean;
  }>;
}>;

function resolveComparableKey(rawUrl: string): string | null {
  const value = String(rawUrl ?? '').trim();
  if (!value) {
    return null;
  }
  try {
    return createServerUrlComparableKey(value);
  } catch {
    return null;
  }
}

function resolveCredentialPathCandidates(serverId: string): Readonly<{ primaryPath: string; legacyPath: string }> {
  const primaryPath = join(configuration.serversDir, serverId, 'access.key');
  const legacyPath = join(configuration.happyHomeDir, 'access.key');
  return { primaryPath, legacyPath };
}

async function readAuthTokenForServerId(serverId: string): Promise<string | null> {
  const { primaryPath, legacyPath } = resolveCredentialPathCandidates(serverId);
  const canUseLegacy = serverId === 'cloud' && existsSync(legacyPath) && !existsSync(primaryPath);

  const path = existsSync(primaryPath) ? primaryPath : canUseLegacy ? legacyPath : null;
  if (!path) return null;

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    const token = typeof raw?.token === 'string' ? raw.token.trim() : '';
    return token ? token : null;
  } catch {
    return null;
  }
}

function resolveAccountIdFromToken(token: string | null): string | null {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return null;
  try {
    const payload = decodeJwtPayload(value);
    return typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

function resolveServiceInstallationForServer(serverId: string, serverUrl: string): Readonly<{ installed: boolean }> {
  try {
    const snapshot = resolveDaemonServiceInstallationSnapshotFromEnv({
      processEnv: {
        ...process.env,
        HAPPIER_DAEMON_SERVICE_INSTANCE_ID: serverId,
        HAPPIER_DAEMON_SERVICE_SERVER_URL: serverUrl,
      },
    });
    return { installed: snapshot.installed };
  } catch {
    return { installed: false };
  }
}

export async function listDaemonStatusesForAllKnownServers(): Promise<DaemonStatusEntry[]> {
  const settings = await readSettings();
  const persistedServers = settings.servers ?? {};
  const servers: Record<string, { name?: string; serverUrl?: string }> = { ...persistedServers };
  const activeServerId = (configuration.activeServerId ?? '').toString().trim();
  if (activeServerId && !servers[activeServerId]) {
    servers[activeServerId] = {
      name: 'Active Server (current scope)',
      serverUrl: configuration.serverUrl,
    };
  }
  const serverIds = Object.keys(servers);
  const results: DaemonStatusEntry[] = [];
  const activeComparableKey = resolveComparableKey(configuration.publicServerUrl || configuration.serverUrl);

  for (const serverId of serverIds) {
    const profile = servers[serverId];
    const name = profile?.name ?? serverId;
    const serverUrl =
      (profile?.serverUrl ?? '').toString().trim() ||
      (serverId === activeServerId ? (configuration.serverUrl ?? '').toString().trim() : '');
    const daemonStatePath = await resolveDaemonStatePath(serverId);
    const state = await readDaemonStateFromPath(daemonStatePath);
    const running = state ? isPidAlive(state.pid) : false;
    const serviceManagedDaemonRunning = running
      && resolveDaemonStartupSourceServiceManagedState(state?.startupSource, state?.serviceLabel) === true;
    const staleStateFile = Boolean(state && !running);
    const comparableKey = resolveComparableKey(serverUrl);
    const serviceInstallation = resolveServiceInstallationForServer(serverId, serverUrl);
    const token = await readAuthTokenForServerId(serverId);
    const accountId = resolveAccountIdFromToken(token);
    const machineId = resolveMachineIdForServerFromSettings(settings, serverId, accountId);
    const authenticated = token != null;
    const machineRegistered = machineId != null;
    const needsAuth = !authenticated || !machineRegistered;
    const matchesActiveRelay = activeComparableKey && comparableKey ? activeComparableKey === comparableKey : null;
    results.push({
      serverId,
      name,
      serverUrl,
      comparableKey,
      daemonStatePath,
      auth: {
        authenticated,
        needsAuth,
        machineRegistered,
        machineId,
        accountId,
      },
      drift: {
        activeComparableKey,
        matchesActiveRelay,
      },
      service: {
        ...serviceInstallation,
        running: serviceInstallation.installed && serviceManagedDaemonRunning,
      },
      daemon: {
        pid: state?.pid ?? null,
        httpPort: state?.httpPort ?? null,
        running,
        staleStateFile,
      },
    });
  }

  return results;
}

async function waitForProcessDeath(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 75));
  }
  return !isPidAlive(pid);
}

async function stopDaemonViaHttpBestEffort(state: NormalizedDaemonState, opts: StopDaemonOptions): Promise<boolean> {
  try {
    const rawTimeout = process.env.HAPPIER_DAEMON_HTTP_TIMEOUT;
    const parsedTimeout = typeof rawTimeout === 'string' ? Number.parseInt(rawTimeout, 10) : Number.NaN;
    const timeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10_000;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (state.controlToken) headers['x-happier-daemon-token'] = state.controlToken;

    const response = await fetch(`http://127.0.0.1:${state.httpPort}/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify(opts.stopSessions ? { stopSessions: true } : {}),
      signal: AbortSignal.timeout(timeout),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function hasUsableControlToken(state: NormalizedDaemonState): boolean {
  return typeof state.controlToken === 'string' && state.controlToken.trim().length > 0;
}

/**
 * Best-effort stop for all daemons found in known server profiles.
 * Safety: does not force-kill processes; uses the daemon control HTTP endpoint.
 * Daemon publication cleanup remains owned by the daemon lifecycle lock.
 */
export async function stopAllDaemonsBestEffort(opts: StopDaemonOptions = {}): Promise<void> {
  const statuses = await listDaemonStatusesForAllKnownServers();
  for (const entry of statuses) {
    const statePath = entry.daemonStatePath;
    const state = await readDaemonStateFromPath(statePath);
    if (!state) continue;

    if (!isPidAlive(state.pid)) continue;

    const stopped = await stopDaemonViaHttpBestEffort(state, opts);
    if (!stopped) continue;

    await waitForProcessDeath(state.pid, 2500);
  }
}

export async function reapSameHomeDaemonOrphansBeforeStart(
  opts: Readonly<{
    preservePids?: readonly number[];
  }> = {},
): Promise<SameHomeDaemonOrphanReapResult> {
  const preservePids = new Set(
    [process.pid, ...(opts.preservePids ?? [])]
      .filter((pid): pid is number => Number.isInteger(pid) && pid > 0),
  );
  const stoppedPids = new Set<number>();
  const preservedPids = new Set<number>();
  const failedPids = new Set<number>();
  const stoppedOrAttemptedPids = new Set<number>();

  for (const record of await listSameHomeDaemonStateRecords()) {
    const { state } = record;
    if (preservePids.has(state.pid)) {
      preservedPids.add(state.pid);
      continue;
    }

    if (!isPidAlive(state.pid)) continue;

    if (stoppedOrAttemptedPids.has(state.pid)) {
      continue;
    }
    stoppedOrAttemptedPids.add(state.pid);

    if (!hasUsableControlToken(state)) {
      failedPids.add(state.pid);
      continue;
    }

    const stopped = await stopDaemonViaHttpBestEffort(state, { stopSessions: false });
    if (!stopped) {
      failedPids.add(state.pid);
      continue;
    }

    const exited = await waitForProcessDeath(state.pid, 2500);
    if (!exited) {
      failedPids.add(state.pid);
      continue;
    }

    stoppedPids.add(state.pid);
  }

  return {
    stoppedPids: [...stoppedPids],
    preservedPids: [...preservedPids],
    failedPids: [...failedPids],
  };
}
