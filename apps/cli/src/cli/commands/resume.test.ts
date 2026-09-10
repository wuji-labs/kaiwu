import { beforeEach, describe, expect, it, vi } from 'vitest';

import tweetnacl from 'tweetnacl';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  accountSettingsParse,
  buildConnectedServiceCredentialRecord,
  sealAccountScopedBlobCiphertext,
  sealEncryptedDataKeyEnvelopeV1,
} from '@happier-dev/protocol';

import { reloadConfiguration } from '@/configuration';
import type { Credentials } from '@/persistence';
import { encodeBase64, encrypt } from '@/api/encryption';
import { readSessionAttachFromEnv } from '@/agent/runtime/sessionAttach';
import { createSessionRecordFixture } from '@/testkit/backends/sessionFixtures';
import type { CommandHandler } from '@/cli/commandRegistry';
import { resolveConnectedServiceMaterializedRootDir } from '@/daemon/connectedServices/materialize/resolveConnectedServiceMaterializedRootDir';
import { waitForCondition } from '@/testkit/async/waitFor';

import { handleResumeCommand } from './resume';

function deterministicRandomBytesFactory(): (length: number) => Uint8Array {
  let counter = 1;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = counter & 0xff;
      counter++;
    }
    return out;
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

describe('happier resume', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as any);

  beforeEach(() => {
    exitSpy.mockClear();
  });

  it('prints usage for --help without requiring authentication', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const readCredentialsFn = vi.fn(async () => null);

    try {
      await handleResumeCommand(['--help'], {
        readCredentialsFn,
        fetchSessionByIdFn: async () => null,
      });

      expect(readCredentialsFn).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.flat().join('\n');
      expect(output).toContain('kaiwu resume');
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('creates an attach file and dispatches to the agent handler with --resume', async () => {
    const home = await mkdtemp(join(tmpdir(), 'happier-resume-'));
    const directory = await mkdtemp(join(tmpdir(), 'happier-resume-dir-'));
    const prevHome = process.env.HAPPIER_HOME_DIR;
    const prevAttach = process.env.HAPPIER_SESSION_ATTACH_FILE;
    const prevCwd = process.cwd();

    try {
      process.env.HAPPIER_HOME_DIR = home;
      reloadConfiguration();

      const machineKey = new Uint8Array(32).fill(11);
      const publicKey = tweetnacl.box.keyPair.fromSecretKey(machineKey).publicKey;
      const credentials: Credentials = {
        token: 'token-1',
        encryption: { type: 'dataKey', machineKey, publicKey },
      };

      const sessionEncryptionKey = new Uint8Array(32).fill(5);
      const envelope = sealEncryptedDataKeyEnvelopeV1({
        dataKey: sessionEncryptionKey,
        recipientPublicKey: publicKey,
        randomBytes: deterministicRandomBytesFactory(),
      });

      const vendorResumeId = 'codex_vendor_session_1';
      const rawSession = {
        ...createSessionRecordFixture({
          id: 'sid_1',
          dataEncryptionKey: encodeBase64(envelope),
          metadata: encodeBase64(
            encrypt(sessionEncryptionKey, 'dataKey', {
              path: directory,
              host: 'test',
              flavor: 'codex',
              codexSessionId: vendorResumeId,
            }),
          ),
          active: false,
          activeAt: 0,
        }),
      };

      const dispatched: { args: string[] }[] = [];
      const agentHandler: CommandHandler = vi.fn(async (context) => {
        dispatched.push({ args: [...context.args] });
        expect(await realpath(process.cwd())).toBe(await realpath(directory));

        const attach = await readSessionAttachFromEnv();
        expect(attach).not.toBeNull();
        expect(attach).toEqual({ encryptionMode: 'e2ee', encryptionVariant: 'dataKey', encryptionKey: sessionEncryptionKey });
      });

      await handleResumeCommand(['sid_1'], {
        readCredentialsFn: async () => credentials,
        fetchSessionByIdFn: async () => rawSession,
        readAccountSettingsFn: async () => accountSettingsParse({ schemaVersion: 6, codexBackendMode: 'acp' }),
        resolveAgentHandlerFn: async () => agentHandler,
        chdirFn: (next: string) => process.chdir(next),
      });

      expect(agentHandler).toHaveBeenCalledTimes(1);
      expect(dispatched[0]?.args[0]).toBe('codex');
      expect(dispatched[0]?.args).toContain('--existing-session');
      expect(dispatched[0]?.args).toContain('sid_1');
      expect(dispatched[0]?.args).toContain('--resume');
      expect(dispatched[0]?.args).toContain(vendorResumeId);
      expect(process.env.HAPPIER_SESSION_ATTACH_FILE ?? '').toBe('');

      const attachDir = join(home, 'tmp', 'session-attach');
      const attachFiles = await readdir(attachDir).catch(() => []);
      expect(attachFiles).toEqual([]);
    } finally {
      try {
        process.chdir(prevCwd);
      } catch {
        // ignore
      }
      if (prevAttach === undefined) delete process.env.HAPPIER_SESSION_ATTACH_FILE;
      else process.env.HAPPIER_SESSION_ATTACH_FILE = prevAttach;
      if (prevHome === undefined) delete process.env.HAPPIER_HOME_DIR;
      else process.env.HAPPIER_HOME_DIR = prevHome;
      reloadConfiguration();
      await rm(home, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('supports plaintext sessions by creating an attach payload without a data encryption key', async () => {
    const home = await mkdtemp(join(tmpdir(), 'happier-resume-plain-'));
    const directory = await mkdtemp(join(tmpdir(), 'happier-resume-plain-dir-'));
    const prevHome = process.env.HAPPIER_HOME_DIR;
    const prevAttach = process.env.HAPPIER_SESSION_ATTACH_FILE;
    const prevCwd = process.cwd();

    try {
      process.env.HAPPIER_HOME_DIR = home;
      reloadConfiguration();

      const credentials: Credentials = {
        token: 'token-1',
        encryption: { type: 'legacy', secret: new Uint8Array(32).fill(11) },
      };

      const vendorResumeId = 'claude_vendor_session_1';
      const rawSession = {
        ...createSessionRecordFixture({
          id: 'sid_plain_1',
          encryptionMode: 'plain',
          dataEncryptionKey: null,
          metadata: JSON.stringify({
            path: directory,
            host: 'test',
            flavor: 'claude',
            claudeSessionId: vendorResumeId,
          }),
          active: false,
          activeAt: 0,
        }),
      };

      const dispatched: { args: string[] }[] = [];
      const agentHandler: CommandHandler = vi.fn(async (context) => {
        dispatched.push({ args: [...context.args] });
        expect(await realpath(process.cwd())).toBe(await realpath(directory));

        const attach = await readSessionAttachFromEnv();
        expect(attach).toEqual({ encryptionMode: 'plain' });
      });

      await handleResumeCommand(['sid_plain_1'], {
        readCredentialsFn: async () => credentials,
        fetchSessionByIdFn: async () => rawSession,
        readAccountSettingsFn: async () => accountSettingsParse({ schemaVersion: 6, codexBackendMode: 'acp' }),
        resolveAgentHandlerFn: async () => agentHandler,
        chdirFn: (next: string) => process.chdir(next),
      });

      expect(agentHandler).toHaveBeenCalledTimes(1);
      expect(dispatched[0]?.args[0]).toBe('claude');
      expect(dispatched[0]?.args).toContain('--existing-session');
      expect(dispatched[0]?.args).toContain('sid_plain_1');
      expect(dispatched[0]?.args).toContain('--resume');
      expect(dispatched[0]?.args).toContain(vendorResumeId);

      const attachDir = join(home, 'tmp', 'session-attach');
      const attachFiles = await readdir(attachDir).catch(() => []);
      expect(attachFiles).toEqual([]);
    } finally {
      try {
        process.chdir(prevCwd);
      } catch {
        // ignore
      }
      if (prevAttach === undefined) delete process.env.HAPPIER_SESSION_ATTACH_FILE;
      else process.env.HAPPIER_SESSION_ATTACH_FILE = prevAttach;
      if (prevHome === undefined) delete process.env.HAPPIER_HOME_DIR;
      else process.env.HAPPIER_HOME_DIR = prevHome;
      reloadConfiguration();
      await rm(home, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('materializes connected-service auth from persisted Codex metadata before direct terminal resume dispatch', async () => {
    const home = await mkdtemp(join(tmpdir(), 'happier-resume-connected-home-'));
    const directory = await mkdtemp(join(tmpdir(), 'happier-resume-connected-dir-'));
    const prevHome = process.env.HAPPIER_HOME_DIR;
    const prevAttach = process.env.HAPPIER_SESSION_ATTACH_FILE;
    const prevServerUrl = process.env.HAPPIER_SERVER_URL;
    const prevWebappUrl = process.env.HAPPIER_WEBAPP_URL;
    const prevCodexHome = process.env.CODEX_HOME;
    const prevCodexSqliteHome = process.env.CODEX_SQLITE_HOME;
    const prevBindingsEnv = process.env.HAPPIER_SESSION_CONNECTED_SERVICES_BINDINGS_JSON;
    const prevIdentityEnv = process.env.HAPPIER_SESSION_CONNECTED_SERVICE_MATERIALIZATION_IDENTITY_V1_JSON;
    const prevSelectionsEnv = process.env.HAPPIER_CONNECTED_SERVICE_SELECTIONS_JSON;
    const prevMaterializedKeysEnv = process.env.HAPPIER_CONNECTED_SERVICE_MATERIALIZED_ENV_KEYS_JSON;
    const prevTargetRootEnv = process.env.HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT;
    const prevCwd = process.cwd();

    const now = Date.now();
    const credentials: Credentials = {
      token: 'token-connected',
      encryption: { type: 'legacy', secret: new Uint8Array(32).fill(13) },
    };
    if (credentials.encryption.type !== 'legacy') {
      throw new Error('test fixture expected legacy encryption');
    }
    const credentialRecord = buildConnectedServiceCredentialRecord({
      now,
      serviceId: 'openai-codex',
      profileId: 'work',
      kind: 'oauth',
      expiresAt: now + 3_600_000,
      oauth: {
        accessToken: 'connected-access',
        refreshToken: 'connected-refresh',
        idToken: 'connected-id-token',
        scope: null,
        tokenType: 'Bearer',
        providerAccountId: 'connected-account',
        providerEmail: 'codex@example.test',
      },
    });
    const credentialCiphertext = sealAccountScopedBlobCiphertext({
      kind: 'connected_service_credential',
      material: { type: 'legacy', secret: credentials.encryption.secret },
      payload: credentialRecord,
      randomBytes,
    });
    const server = await new Promise<Server>((resolve, reject) => {
      const next = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET' && url.pathname === '/v1/account/encryption') {
          res.end(JSON.stringify({ mode: 'e2ee', updatedAt: now }));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/v2/connect/openai-codex/profiles') {
          res.end(JSON.stringify({
            serviceId: 'openai-codex',
            profiles: [{
              profileId: 'work',
              status: 'connected',
              kind: 'oauth',
              providerEmail: 'codex@example.test',
              providerAccountId: 'connected-account',
              expiresAt: now + 3_600_000,
            }],
          }));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/v2/connect/openai-codex/profiles/work/credential') {
          res.end(JSON.stringify({
            sealed: { format: 'account_scoped_v1', ciphertext: credentialCiphertext },
            metadata: {
              kind: 'oauth',
              providerEmail: 'codex@example.test',
              providerAccountId: 'connected-account',
              expiresAt: now + 3_600_000,
            },
          }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not_found' }));
      });
      next.on('error', reject);
      next.listen(0, '127.0.0.1', () => resolve(next));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve connected-service fixture server address');
    }
    const serverUrl = `http://127.0.0.1:${address.port}`;

    try {
      process.env.HAPPIER_HOME_DIR = home;
      process.env.HAPPIER_SERVER_URL = serverUrl;
      process.env.HAPPIER_WEBAPP_URL = serverUrl;
      reloadConfiguration();

      const connectedServices = {
        v: 1 as const,
        bindingsByServiceId: {
          'openai-codex': {
            source: 'connected' as const,
            selection: 'profile' as const,
            profileId: 'work',
          },
        },
      };
      const materializationIdentity = {
        v: 1 as const,
        id: 'csm_resume_codex_terminal',
        createdAtMs: 1234,
      };
      const vendorResumeId = 'codex_vendor_connected_1';
      const rawSession = {
        ...createSessionRecordFixture({
          id: 'sid_connected_1',
          encryptionMode: 'plain',
          dataEncryptionKey: null,
          metadata: JSON.stringify({
            path: directory,
            host: 'test',
            flavor: 'codex',
            codexSessionId: vendorResumeId,
            connectedServices,
            connectedServicesUpdatedAt: 5678,
            connectedServiceMaterializationIdentityV1: materializationIdentity,
          }),
          active: false,
          activeAt: 0,
        }),
      };

      const agentHandler: CommandHandler = vi.fn(async () => {
        const codexHome = process.env.CODEX_HOME;
        expect(codexHome).toBeTypeOf('string');
        expect(process.env.CODEX_SQLITE_HOME).toBe(codexHome);
        expect(JSON.parse(process.env.HAPPIER_SESSION_CONNECTED_SERVICES_BINDINGS_JSON ?? 'null')).toEqual(connectedServices);
        expect(JSON.parse(process.env.HAPPIER_SESSION_CONNECTED_SERVICE_MATERIALIZATION_IDENTITY_V1_JSON ?? 'null')).toEqual(materializationIdentity);
        expect(JSON.parse(process.env.HAPPIER_CONNECTED_SERVICE_SELECTIONS_JSON ?? '[]')).toEqual([
          {
            kind: 'profile',
            serviceId: 'openai-codex',
            profileId: 'work',
            credentialRevision: null,
          },
        ]);
        expect(JSON.parse(process.env.HAPPIER_CONNECTED_SERVICE_MATERIALIZED_ENV_KEYS_JSON ?? '[]')).toEqual([
          'CODEX_HOME',
          'CODEX_SQLITE_HOME',
        ]);
        const auth = JSON.parse(await readFile(join(codexHome!, 'auth.json'), 'utf8')) as Record<string, unknown>;
        expect(auth.access_token).toBe('connected-access');
      });

      await handleResumeCommand(['sid_connected_1'], {
        readCredentialsFn: async () => credentials,
        fetchSessionByIdFn: async () => rawSession,
        readAccountSettingsFn: async () => accountSettingsParse({
          schemaVersion: 6,
          codexBackendMode: 'appServer',
          connectedServicesDefaultAuthByAgentIdV1: {
            v: 1,
            bindingsByAgentId: {
              codex: {
                v: 1,
                bindingsByServiceId: {
                  'openai-codex': {
                    source: 'connected',
                    selection: 'profile',
                    profileId: 'different-current-default',
                  },
                },
              },
            },
          },
          connectedServicesProviderStateSharingSettingsV1: {
            defaults: { configMode: 'linked', stateMode: 'isolated' },
            byAgentId: {
              codex: { stateMode: 'isolated' },
            },
          },
        }),
        resolveAgentHandlerFn: async () => agentHandler,
        chdirFn: (next: string) => process.chdir(next),
      });

      expect(agentHandler).toHaveBeenCalledTimes(1);
      expect(process.env.CODEX_HOME).toBe(prevCodexHome);
      expect(process.env.CODEX_SQLITE_HOME).toBe(prevCodexSqliteHome);
      expect(process.env.HAPPIER_SESSION_CONNECTED_SERVICES_BINDINGS_JSON).toBe(prevBindingsEnv);
      expect(process.env.HAPPIER_SESSION_CONNECTED_SERVICE_MATERIALIZATION_IDENTITY_V1_JSON).toBe(prevIdentityEnv);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      try {
        process.chdir(prevCwd);
      } catch {
        // ignore
      }
      if (prevAttach === undefined) delete process.env.HAPPIER_SESSION_ATTACH_FILE;
      else process.env.HAPPIER_SESSION_ATTACH_FILE = prevAttach;
      if (prevHome === undefined) delete process.env.HAPPIER_HOME_DIR;
      else process.env.HAPPIER_HOME_DIR = prevHome;
      if (prevServerUrl === undefined) delete process.env.HAPPIER_SERVER_URL;
      else process.env.HAPPIER_SERVER_URL = prevServerUrl;
      if (prevWebappUrl === undefined) delete process.env.HAPPIER_WEBAPP_URL;
      else process.env.HAPPIER_WEBAPP_URL = prevWebappUrl;
      if (prevCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prevCodexHome;
      if (prevCodexSqliteHome === undefined) delete process.env.CODEX_SQLITE_HOME;
      else process.env.CODEX_SQLITE_HOME = prevCodexSqliteHome;
      if (prevBindingsEnv === undefined) delete process.env.HAPPIER_SESSION_CONNECTED_SERVICES_BINDINGS_JSON;
      else process.env.HAPPIER_SESSION_CONNECTED_SERVICES_BINDINGS_JSON = prevBindingsEnv;
      if (prevIdentityEnv === undefined) delete process.env.HAPPIER_SESSION_CONNECTED_SERVICE_MATERIALIZATION_IDENTITY_V1_JSON;
      else process.env.HAPPIER_SESSION_CONNECTED_SERVICE_MATERIALIZATION_IDENTITY_V1_JSON = prevIdentityEnv;
      if (prevSelectionsEnv === undefined) delete process.env.HAPPIER_CONNECTED_SERVICE_SELECTIONS_JSON;
      else process.env.HAPPIER_CONNECTED_SERVICE_SELECTIONS_JSON = prevSelectionsEnv;
      if (prevMaterializedKeysEnv === undefined) delete process.env.HAPPIER_CONNECTED_SERVICE_MATERIALIZED_ENV_KEYS_JSON;
      else process.env.HAPPIER_CONNECTED_SERVICE_MATERIALIZED_ENV_KEYS_JSON = prevMaterializedKeysEnv;
      if (prevTargetRootEnv === undefined) delete process.env.HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT;
      else process.env.HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT = prevTargetRootEnv;
      reloadConfiguration();
      await rm(home, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('cleans up connected-service materialization when direct resume fails before handler dispatch', async () => {
    const home = await mkdtemp(join(tmpdir(), 'happier-resume-connected-cleanup-home-'));
    const directory = await mkdtemp(join(tmpdir(), 'happier-resume-connected-cleanup-dir-'));
    const prevHome = process.env.HAPPIER_HOME_DIR;
    const prevServerUrl = process.env.HAPPIER_SERVER_URL;
    const prevWebappUrl = process.env.HAPPIER_WEBAPP_URL;
    const prevCodexBackendMode = process.env.HAPPIER_CODEX_BACKEND_MODE;
    const prevCodexAcpBin = process.env.HAPPIER_CODEX_ACP_BIN;
    const prevAttach = process.env.HAPPIER_SESSION_ATTACH_FILE;
    const prevCwd = process.cwd();

    const now = Date.now();
    const credentials: Credentials = {
      token: 'token-connected-cleanup',
      encryption: { type: 'legacy', secret: new Uint8Array(32).fill(17) },
    };
    if (credentials.encryption.type !== 'legacy') {
      throw new Error('test fixture expected legacy encryption');
    }
    const credentialRecord = buildConnectedServiceCredentialRecord({
      now,
      serviceId: 'openai-codex',
      profileId: 'work',
      kind: 'oauth',
      expiresAt: now + 3_600_000,
      oauth: {
        accessToken: 'cleanup-access',
        refreshToken: 'cleanup-refresh',
        idToken: 'cleanup-id-token',
        scope: null,
        tokenType: 'Bearer',
        providerAccountId: 'cleanup-account',
        providerEmail: 'cleanup@example.test',
      },
    });
    const credentialCiphertext = sealAccountScopedBlobCiphertext({
      kind: 'connected_service_credential',
      material: { type: 'legacy', secret: credentials.encryption.secret },
      payload: credentialRecord,
      randomBytes,
    });
    const server = await new Promise<Server>((resolve, reject) => {
      const next = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET' && url.pathname === '/v1/account/encryption') {
          res.end(JSON.stringify({ mode: 'e2ee', updatedAt: now }));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/v2/connect/openai-codex/profiles') {
          res.end(JSON.stringify({
            serviceId: 'openai-codex',
            profiles: [{
              profileId: 'work',
              status: 'connected',
              kind: 'oauth',
              providerEmail: 'cleanup@example.test',
              providerAccountId: 'cleanup-account',
              expiresAt: now + 3_600_000,
            }],
          }));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/v2/connect/openai-codex/profiles/work/credential') {
          res.end(JSON.stringify({
            sealed: { format: 'account_scoped_v1', ciphertext: credentialCiphertext },
            metadata: {
              kind: 'oauth',
              providerEmail: 'cleanup@example.test',
              providerAccountId: 'cleanup-account',
              expiresAt: now + 3_600_000,
            },
          }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not_found' }));
      });
      next.on('error', reject);
      next.listen(0, '127.0.0.1', () => resolve(next));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve connected-service fixture server address');
    }
    const serverUrl = `http://127.0.0.1:${address.port}`;

    const connectedServices = {
      v: 1 as const,
      bindingsByServiceId: {
        'openai-codex': {
          source: 'connected' as const,
          selection: 'profile' as const,
          profileId: 'work',
        },
      },
    };
    const materializationIdentity = {
      v: 1 as const,
      id: 'csm_resume_codex_cleanup',
      createdAtMs: 1234,
    };
    const materializedRoot = resolveConnectedServiceMaterializedRootDir({
      baseDir: join(home, 'daemon', 'connected-services', 'materialized'),
      agentId: 'codex',
      materializationKey: materializationIdentity.id,
      materializationIdentity,
    });
    const rawSession = {
      ...createSessionRecordFixture({
        id: 'sid_connected_cleanup_1',
        encryptionMode: 'plain',
        dataEncryptionKey: null,
        metadata: JSON.stringify({
          path: directory,
          host: 'test',
          flavor: 'codex',
          codexSessionId: 'codex_vendor_connected_cleanup_1',
          connectedServices,
          connectedServicesUpdatedAt: 5678,
          connectedServiceMaterializationIdentityV1: materializationIdentity,
        }),
        active: false,
        activeAt: 0,
      }),
    };
    const agentHandler: CommandHandler = vi.fn(async () => {});

    try {
      process.env.HAPPIER_HOME_DIR = home;
      process.env.HAPPIER_SERVER_URL = serverUrl;
      process.env.HAPPIER_WEBAPP_URL = serverUrl;
      process.env.HAPPIER_CODEX_BACKEND_MODE = 'acp';
      process.env.HAPPIER_CODEX_ACP_BIN = join(home, 'missing-codex-acp');
      reloadConfiguration();

      await expect(handleResumeCommand(['sid_connected_cleanup_1'], {
        readCredentialsFn: async () => credentials,
        fetchSessionByIdFn: async () => rawSession,
        readAccountSettingsFn: async () => accountSettingsParse({
          schemaVersion: 6,
          codexBackendMode: 'acp',
          connectedServicesProviderStateSharingSettingsV1: {
            defaults: { configMode: 'linked', stateMode: 'isolated' },
            byAgentId: {
              codex: { stateMode: 'isolated' },
            },
          },
        }),
        resolveAgentHandlerFn: async () => agentHandler,
        chdirFn: (next: string) => process.chdir(next),
      })).rejects.toThrow(/Codex ACP is enabled/);

      expect(agentHandler).not.toHaveBeenCalled();
      await expectPathRemoved(materializedRoot);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      try {
        process.chdir(prevCwd);
      } catch {
        // ignore
      }
      if (prevAttach === undefined) delete process.env.HAPPIER_SESSION_ATTACH_FILE;
      else process.env.HAPPIER_SESSION_ATTACH_FILE = prevAttach;
      if (prevHome === undefined) delete process.env.HAPPIER_HOME_DIR;
      else process.env.HAPPIER_HOME_DIR = prevHome;
      if (prevServerUrl === undefined) delete process.env.HAPPIER_SERVER_URL;
      else process.env.HAPPIER_SERVER_URL = prevServerUrl;
      if (prevWebappUrl === undefined) delete process.env.HAPPIER_WEBAPP_URL;
      else process.env.HAPPIER_WEBAPP_URL = prevWebappUrl;
      if (prevCodexBackendMode === undefined) delete process.env.HAPPIER_CODEX_BACKEND_MODE;
      else process.env.HAPPIER_CODEX_BACKEND_MODE = prevCodexBackendMode;
      if (prevCodexAcpBin === undefined) delete process.env.HAPPIER_CODEX_ACP_BIN;
      else process.env.HAPPIER_CODEX_ACP_BIN = prevCodexAcpBin;
      reloadConfiguration();
      await rm(home, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('treats interactive cancellation as a cancel (not as "no resumable sessions")', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const credentials: Credentials = {
        token: 'token-1',
        encryption: { type: 'legacy', secret: new Uint8Array(32).fill(11) },
      };

      const fetchSessionByIdFn = vi.fn(async () => {
        throw new Error('fetchSessionByIdFn should not be called');
      });

      await handleResumeCommand([], {
        readCredentialsFn: async () => credentials,
        readAccountSettingsFn: async () => accountSettingsParse({ schemaVersion: 6, codexBackendMode: 'acp' }),
        fetchSessionByIdFn,
        canUseInkSelectorFn: () => true,
        selectResumableSessionIdFn: async () => ({ type: 'cancelled' }),
      });

      expect(fetchSessionByIdFn).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.flat().join('\n');
      expect(output).toContain('cancel');
      expect(output).not.toContain('No resumable sessions found.');
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('prints a "No resumable sessions" message when there are none in interactive mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const credentials: Credentials = {
        token: 'token-1',
        encryption: { type: 'legacy', secret: new Uint8Array(32).fill(11) },
      };

      const fetchSessionByIdFn = vi.fn(async () => {
        throw new Error('fetchSessionByIdFn should not be called');
      });

      await handleResumeCommand([], {
        readCredentialsFn: async () => credentials,
        readAccountSettingsFn: async () => accountSettingsParse({ schemaVersion: 6, codexBackendMode: 'acp' }),
        fetchSessionByIdFn,
        canUseInkSelectorFn: () => true,
        selectResumableSessionIdFn: async () => ({ type: 'none' }),
      });

      expect(fetchSessionByIdFn).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.flat().join('\n');
      expect(output).toContain('No resumable sessions found.');
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
