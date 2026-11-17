import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildConnectedServiceCredentialRecord, sealAccountScopedBlobCiphertext } from '@happier-dev/protocol';

import type { Credentials } from '@/persistence';
import type { ApiClient } from '@/api/api';

import {
  ConnectedServiceSpawnResumeUnreachableError,
  resolveConnectedServiceAuthForSpawn,
} from './resolveConnectedServiceAuthForSpawn';
import { resolveConnectedServiceMaterializedRootDir } from './materialize/resolveConnectedServiceMaterializedRootDir';
import { waitForCondition } from '@/testkit/async/waitFor';

/**
 * K1 increment-3 — the §2 hard post-materialization reachability RE-VERIFY gate.
 *
 * These tests exercise the spawn path AFTER `materializeConnectedServicesForSpawn` produces the real
 * materialized env/root, BEFORE the vendor launches. They prove the TARGET the vendor will actually
 * read — not "hope the import lands":
 *   - RED: shared-state continuity requested + a resume id whose session file is genuinely absent from
 *     every target/native root => the spawn FAILS CLOSED with the structured continuity reason
 *     (`provider_session_state_unavailable_for_resume`, failurePhase `continuity`) instead of
 *     returning an env the vendor would crash on ("Pi process exited").
 *   - GREEN: native session file exists, the import lands in the materialized target => the gate
 *     proves reachability and the spawn proceeds (env returned).
 *   - D8 cross-machine fallback: a stale persisted absolute `piSessionFile` that fails to stat must
 *     NOT hard-fail when the id+cwd native search can still resolve the session.
 *   - Guard: a fresh (no-resume) spawn, and an isolated (no continuity) spawn, are NOT gated.
 */

function makeCodexOauthRecord(now: number) {
  return buildConnectedServiceCredentialRecord({
    now,
    serviceId: 'openai-codex',
    profileId: 'work',
    kind: 'oauth',
    expiresAt: now + 3_600_000,
    oauth: {
      accessToken: 'codex-access',
      refreshToken: 'codex-refresh',
      idToken: 'codex-id',
      scope: null,
      tokenType: 'Bearer',
      providerAccountId: 'codex-acct',
      providerEmail: null,
    },
  });
}

function makeLegacyCredentials(): Credentials {
  const credentials: Credentials = {
    token: 'happy-token',
    encryption: { type: 'legacy', secret: new Uint8Array(32).fill(7) },
  };
  if (credentials.encryption.type !== 'legacy') {
    throw new Error('test fixture expected legacy encryption');
  }
  return credentials;
}

function makeCodexApi(now: number, credentials: Credentials): ApiClient {
  if (credentials.encryption.type !== 'legacy') {
    throw new Error('test fixture expected legacy encryption');
  }
  const secret = credentials.encryption.secret;
  const ciphertext = sealAccountScopedBlobCiphertext({
    kind: 'connected_service_credential',
    material: { type: 'legacy', secret },
    payload: makeCodexOauthRecord(now),
    randomBytes: (length) => randomBytes(length),
  });
  return {
    getConnectedServiceCredentialSealed: async (params: { serviceId: string; profileId: string }) => {
      if (params.serviceId !== 'openai-codex' || params.profileId !== 'work') return null;
      return {
        sealed: { format: 'account_scoped_v1', ciphertext },
        metadata: { kind: 'oauth', providerEmail: null, providerAccountId: 'codex-acct', expiresAt: null },
      };
    },
  } as unknown as ApiClient;
}

const CODEX_CONNECTED_BINDINGS = {
  v: 1,
  bindingsByServiceId: {
    'openai-codex': { source: 'connected', profileId: 'work' },
  },
} as const;

function sharedStateAccountSettings() {
  return {
    connectedServicesProviderStateSharingSettingsV1: {
      v: 1,
      defaults: { configMode: 'isolated', stateMode: 'isolated' },
      byAgentId: {
        codex: { stateMode: 'shared' },
      },
    },
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function expectPathRemoved(path: string): Promise<void> {
  await waitForCondition(async () => !(await pathExists(path)), {
    label: `removal of ${path}`,
    timeoutMs: 1_000,
    intervalMs: 25,
  });
  expect(await pathExists(path)).toBe(false);
}

describe('resolveConnectedServiceAuthForSpawn post-materialization resume reachability gate', () => {
  it('recovers a rollout from the previous Codex materialization when the native sessions store was missing', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-recovery-base-'));
    const activeServerDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-recovery-server-'));
    const sourceCodexHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-recovery-source-home-'));
    const fakeHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-recovery-home-'));
    const originalHome = process.env.HOME;
    const now = 1_000_000;
    const cwd = '/tmp/reverify-codex-recovery-project';
    const vendorResumeId = '00000000-0000-4000-8000-000000000002';
    const relativeRolloutPath = join(
      'sessions',
      '2026',
      '08',
      '24',
      `rollout-2026-08-24T12-00-00-${vendorResumeId}.jsonl`,
    );
    const materializedRoot = resolveConnectedServiceMaterializedRootDir({
      baseDir,
      agentId: 'codex',
      materializationKey: 'codex-session-recovery',
      materializationIdentity: null,
    });

    const credentials = makeLegacyCredentials();
    const api = makeCodexApi(now, credentials);
    try {
      process.env.HOME = fakeHome;
      await mkdir(join(materializedRoot, 'codex-home', 'sessions', '2026', '08', '24'), { recursive: true });
      await writeFile(
        join(materializedRoot, 'codex-home', relativeRolloutPath),
        '{"type":"session"}\n',
      );
      await writeFile(
        join(materializedRoot, 'codex-home', 'history.jsonl'),
        '{"text":"previous prompt"}\n',
      );
      await writeFile(
        join(materializedRoot, 'codex-home', 'session_index.jsonl'),
        '{"id":"previous session"}\n',
      );
      await mkdir(join(materializedRoot, 'codex-home', 'memories'), { recursive: true });
      await writeFile(
        join(materializedRoot, 'codex-home', 'memories', 'raw_memories.md'),
        '# Previous memory\n',
      );

      const connectedServiceAuth = await resolveConnectedServiceAuthForSpawn({
        agentId: 'codex',
        sessionDirectory: cwd,
        connectedServicesBindingsRaw: CODEX_CONNECTED_BINDINGS,
        materializationKey: 'codex-session-recovery',
        activeServerDir,
        baseDir,
        credentials,
        api,
        nowMs: () => now,
        accountSettings: sharedStateAccountSettings(),
        processEnv: {
          CODEX_HOME: sourceCodexHome,
          CODEX_SQLITE_HOME: sourceCodexHome,
          HOME: fakeHome,
        } as NodeJS.ProcessEnv,
        vendorResumeId,
        resumeReachabilityRequired: true,
      });

      expect(connectedServiceAuth).not.toBeNull();
      await expect(readFile(join(sourceCodexHome, relativeRolloutPath), 'utf8')).resolves.toBe('{"type":"session"}\n');
      await expect(readFile(join(connectedServiceAuth!.env.CODEX_HOME!, relativeRolloutPath), 'utf8')).resolves.toBe('{"type":"session"}\n');
      await expect(readFile(join(sourceCodexHome, 'history.jsonl'), 'utf8')).resolves.toBe('{"text":"previous prompt"}\n');
      await expect(readFile(join(sourceCodexHome, 'session_index.jsonl'), 'utf8')).resolves.toBe('{"id":"previous session"}\n');
      await expect(readFile(join(sourceCodexHome, 'memories', 'raw_memories.md'), 'utf8')).resolves.toBe('# Previous memory\n');
      await expect(readFile(join(connectedServiceAuth!.env.CODEX_HOME!, 'memories', 'raw_memories.md'), 'utf8')).resolves.toBe('# Previous memory\n');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      await rm(baseDir, { recursive: true, force: true });
      await rm(activeServerDir, { recursive: true, force: true });
      await rm(sourceCodexHome, { recursive: true, force: true });
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('restores the previous Codex materialization when resume validation fails', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-rollback-base-'));
    const activeServerDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-rollback-server-'));
    const sourceCodexHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-rollback-source-home-'));
    const fakeHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-rollback-home-'));
    const originalHome = process.env.HOME;
    const now = 1_000_000;
    const cwd = '/tmp/reverify-codex-rollback-project';
    const materializedRoot = resolveConnectedServiceMaterializedRootDir({
      baseDir,
      agentId: 'codex',
      materializationKey: 'codex-session-rollback',
      materializationIdentity: null,
    });
    const sentinelPath = join(materializedRoot, 'codex-home', 'previous-session.jsonl');

    const credentials = makeLegacyCredentials();
    const api = makeCodexApi(now, credentials);
    try {
      process.env.HOME = fakeHome;
      await mkdir(join(materializedRoot, 'codex-home'), { recursive: true });
      await writeFile(sentinelPath, '{"previous":true}\n');

      await expect(resolveConnectedServiceAuthForSpawn({
        agentId: 'codex',
        sessionDirectory: cwd,
        connectedServicesBindingsRaw: CODEX_CONNECTED_BINDINGS,
        materializationKey: 'codex-session-rollback',
        activeServerDir,
        baseDir,
        credentials,
        api,
        nowMs: () => now,
        accountSettings: sharedStateAccountSettings(),
        processEnv: {
          CODEX_HOME: sourceCodexHome,
          CODEX_SQLITE_HOME: sourceCodexHome,
          HOME: fakeHome,
        } as NodeJS.ProcessEnv,
        vendorResumeId: '00000000-0000-4000-8000-000000000003',
        resumeReachabilityRequired: true,
      })).rejects.toMatchObject({
        name: 'ConnectedServiceSpawnResumeUnreachableError',
        reason: 'codex_session_file_not_found',
      });

      await expect(readFile(sentinelPath, 'utf8')).resolves.toBe('{"previous":true}\n');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      await rm(baseDir, { recursive: true, force: true });
      await rm(activeServerDir, { recursive: true, force: true });
      await rm(sourceCodexHome, { recursive: true, force: true });
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('cleans up a Codex materialized root when post-materialization resume reachability fails without a provider cleanup hook', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-miss-base-'));
    const activeServerDir = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-miss-server-'));
    const sourceCodexHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-source-home-'));
    const fakeHome = await mkdtemp(join(tmpdir(), 'happier-reverify-codex-home-'));
    const originalHome = process.env.HOME;
    const now = 1_000_000;
    const cwd = '/tmp/reverify-codex-miss-project';

    const credentials = makeLegacyCredentials();
    const api = makeCodexApi(now, credentials);
    try {
      process.env.HOME = fakeHome;

      await expect(resolveConnectedServiceAuthForSpawn({
        agentId: 'codex',
        sessionDirectory: cwd,
        connectedServicesBindingsRaw: CODEX_CONNECTED_BINDINGS,
        materializationKey: 'codex-session-miss',
        activeServerDir,
        baseDir,
        credentials,
        api,
        nowMs: () => now,
        accountSettings: sharedStateAccountSettings(),
        processEnv: {
          CODEX_HOME: sourceCodexHome,
          CODEX_SQLITE_HOME: sourceCodexHome,
          HOME: fakeHome,
        } as NodeJS.ProcessEnv,
        vendorResumeId: '00000000-0000-4000-8000-000000000001',
        resumeReachabilityRequired: true,
      })).rejects.toMatchObject({
        name: 'ConnectedServiceSpawnResumeUnreachableError',
        errorCode: 'provider_session_state_unavailable_for_resume',
        failurePhase: 'continuity',
        agentId: 'codex',
        vendorResumeId: '00000000-0000-4000-8000-000000000001',
      });

      const materializedRoot = resolveConnectedServiceMaterializedRootDir({
        baseDir,
        agentId: 'codex',
        materializationKey: 'codex-session-miss',
        materializationIdentity: null,
      });
      await expectPathRemoved(materializedRoot);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      await rm(baseDir, { recursive: true, force: true });
      await rm(activeServerDir, { recursive: true, force: true });
      await rm(sourceCodexHome, { recursive: true, force: true });
      await rm(fakeHome, { recursive: true, force: true });
    }
  });






});

void ConnectedServiceSpawnResumeUnreachableError;
