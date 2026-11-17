import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexBackendMode } from '@happier-dev/agents';
import { buildCodexAgentRuntimeDescriptorV1 } from '@happier-dev/protocol';
import { buildOpenCodeAgentRuntimeDescriptorV1 } from '@happier-dev/protocol';
import type {
  ConnectedServiceBindingsV1,
  ConnectedServiceMaterializationIdentityV1,
} from '@happier-dev/protocol';

const fetchSessionsPageMock = vi.fn();
const fetchSessionByIdMock = vi.fn();
const getOrCreateSessionByTagMock = vi.fn();
const tryDecryptSessionMetadataMock = vi.fn();
const updateSessionMetadataWithRetryMock = vi.fn();
const listSessionMarkersMock = vi.fn();

vi.mock('@/session/transport/http/sessionsHttp', () => ({
  fetchSessionById: (...args: unknown[]) => fetchSessionByIdMock(...args),
  fetchSessionsPage: (...args: unknown[]) => fetchSessionsPageMock(...args),
  getOrCreateSessionByTag: (...args: unknown[]) => getOrCreateSessionByTagMock(...args),
}));

vi.mock('@/session/transport/encryption/sessionEncryptionContext', () => ({
  tryDecryptSessionMetadata: (...args: unknown[]) => tryDecryptSessionMetadataMock(...args),
}));

vi.mock('@/session/metadata/updateSessionMetadataWithRetry', () => ({
  updateSessionMetadataWithRetry: (...args: unknown[]) => updateSessionMetadataWithRetryMock(...args),
}));

vi.mock('@/daemon/sessionRegistry', () => ({
  listSessionMarkers: (...args: unknown[]) => listSessionMarkersMock(...args),
}));

import { ensureDirectSessionLink } from './ensureDirectSessionLink';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('ensureDirectSessionLink', () => {
  const legacyCodexBackendMode = '  mcp_resume  ' as unknown as CodexBackendMode;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSessionsPageMock.mockResolvedValue({ sessions: [], hasNext: false, nextCursor: null });
    fetchSessionByIdMock.mockResolvedValue(null);
    tryDecryptSessionMetadataMock.mockReturnValue(null);
    updateSessionMetadataWithRetryMock.mockResolvedValue(undefined);
    listSessionMarkersMock.mockResolvedValue([]);
  });

  it('stores the canonical codex runtime descriptor for linked direct sessions', async () => {
    getOrCreateSessionByTagMock.mockResolvedValueOnce({
      session: {
        id: 'sess_direct_1',
        metadata: {},
      },
    });

    const result = await ensureDirectSessionLink({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: new Uint8Array([1]) } },
      machineId: 'machine_1',
      providerId: 'codex',
      remoteSessionId: 'thread_legacy',
      codexBackendMode: 'mcp',
      runtimeDescriptor: buildCodexAgentRuntimeDescriptorV1({
        backendMode: 'appServer',
        vendorSessionId: 'thread_runtime',
        home: 'connectedService',
        connectedServiceId: 'openai-codex',
        connectedServiceProfileId: 'work',
        connectedServiceGroupId: 'happier',
        homePath: '/tmp/connected-codex-home',
      }),
      source: { kind: 'codexHome', home: 'connectedService', connectedServiceId: 'openai-codex', connectedServiceProfileId: 'work', connectedServiceGroupId: 'happier', homePath: '/tmp/connected-codex-home' },
      titleHint: 'Codex linked session',
      directoryHint: '/repo',
      nowMs: () => 123,
    });

    const createdMetadata = getOrCreateSessionByTagMock.mock.calls[0]?.[0]?.metadata;
    const expectedTag = `direct:v1:${sha256Hex('machine_1|codex|thread_runtime|codexHome:connectedService:openai-codex:group:happier:/tmp/connected-codex-home')}`;
    expect(result.tag).toBe(expectedTag);
    expect(getOrCreateSessionByTagMock.mock.calls[0]?.[0]?.tag).toBe(expectedTag);
    expect(createdMetadata).toMatchObject({
      codexSessionId: 'thread_runtime',
      codexBackendMode: 'appServer',
      agentRuntimeDescriptorV1: {
        v: 1,
        providerId: 'codex',
        provider: {
          backendMode: 'appServer',
          vendorSessionId: 'thread_runtime',
          home: 'connectedService',
          connectedServiceId: 'openai-codex',
          connectedServiceProfileId: 'work',
          connectedServiceGroupId: 'happier',
          homePath: '/tmp/connected-codex-home',
        },
      },
      directSessionV1: {
        remoteSessionId: 'thread_runtime',
        source: { kind: 'codexHome', home: 'connectedService', connectedServiceId: 'openai-codex', connectedServiceProfileId: 'work', connectedServiceGroupId: 'happier', homePath: '/tmp/connected-codex-home' },
        agentRuntimeDescriptorV1: {
          v: 1,
          providerId: 'codex',
          provider: {
            backendMode: 'appServer',
            vendorSessionId: 'thread_runtime',
            home: 'connectedService',
            connectedServiceId: 'openai-codex',
            connectedServiceProfileId: 'work',
            connectedServiceGroupId: 'happier',
            homePath: '/tmp/connected-codex-home',
          },
        },
      },
    });
  });

  it('reuses an exact group-proven predecessor tag after member rotation and repairs canonical linked identity', async () => {
    const legacyTag = `direct:v1:${sha256Hex('machine_1|codex|thread_group|codexHome:connectedService:openai-codex:member-a:/tmp/connected-codex-home')}`;
    const canonicalTag = `direct:v1:${sha256Hex('machine_1|codex|thread_group|codexHome:connectedService:openai-codex:group:primary-pool:/tmp/connected-codex-home')}`;
    const existingMetadata = {
      tag: legacyTag,
      path: '/repo',
      flavor: 'codex',
      codexSessionId: 'thread_group',
      directSessionV1: {
        v: 1,
        providerId: 'codex',
        machineId: 'machine_1',
        remoteSessionId: 'thread_group',
        source: {
          kind: 'codexHome',
          home: 'connectedService',
          connectedServiceId: 'openai-codex',
          connectedServiceProfileId: 'member-a',
          connectedServiceGroupId: 'primary-pool',
          homePath: '/tmp/connected-codex-home',
        },
        linkedAtMs: 1,
      },
    };
    fetchSessionsPageMock
      .mockResolvedValueOnce({ sessions: [], hasNext: false, nextCursor: null })
      .mockResolvedValueOnce({ sessions: [], hasNext: false, nextCursor: null })
      .mockResolvedValueOnce({ sessions: [{ id: 'sess_group', metadata: existingMetadata }], hasNext: false, nextCursor: null });
    fetchSessionByIdMock.mockResolvedValueOnce({ id: 'sess_group', metadata: existingMetadata });
    tryDecryptSessionMetadataMock.mockImplementation(({ rawSession }: { rawSession: { metadata?: unknown } }) => rawSession.metadata);

    const result = await ensureDirectSessionLink({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: new Uint8Array([1]) } },
      machineId: 'machine_1',
      providerId: 'codex',
      remoteSessionId: 'thread_group',
      codexBackendMode: 'appServer',
      source: {
        kind: 'codexHome',
        home: 'connectedService',
        connectedServiceId: 'openai-codex',
        connectedServiceProfileId: 'member-b',
        connectedServiceGroupId: 'primary-pool',
        homePath: '/tmp/connected-codex-home',
      },
      directoryHint: '/repo',
      nowMs: () => 123,
    });

    expect(result).toEqual({ sessionId: 'sess_group', created: false, tag: canonicalTag });
    expect(getOrCreateSessionByTagMock).not.toHaveBeenCalled();
    const updater = updateSessionMetadataWithRetryMock.mock.calls[0]?.[0]?.updater;
    expect(typeof updater).toBe('function');
    expect(updater(existingMetadata)).toMatchObject({
      tag: canonicalTag,
      codexSessionId: 'thread_group',
      agentRuntimeDescriptorV1: {
        provider: {
          vendorSessionId: 'thread_group',
          connectedServiceGroupId: 'primary-pool',
        },
      },
      directSessionV1: {
        remoteSessionId: 'thread_group',
        source: {
          connectedServiceGroupId: 'primary-pool',
        },
        agentRuntimeDescriptorV1: {
          provider: {
            connectedServiceGroupId: 'primary-pool',
          },
        },
      },
    });
  });

  it('prefers providerExtra when linked direct-session runtime descriptors carry stale top-level codex fields', async () => {
    getOrCreateSessionByTagMock.mockResolvedValueOnce({
      session: {
        id: 'sess_direct_2',
        metadata: {},
      },
    });

    await ensureDirectSessionLink({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: new Uint8Array([1]) } },
      machineId: 'machine_1',
      providerId: 'codex',
      remoteSessionId: 'thread_legacy',
      codexBackendMode: 'mcp',
      runtimeDescriptor: {
        v: 1,
        providerId: 'codex',
        provider: {
          backendMode: 'mcp',
          vendorSessionId: 'thread_top_level',
          home: 'user',
          providerExtra: {
            owner: 'codex',
            schemaId: 'codex.agentRuntimeDescriptorExtra',
            v: 1,
            runtimeAffinity: {
              backendMode: 'appServer',
              vendorSessionId: 'thread_runtime',
              home: 'connectedService',
              connectedServiceId: 'openai-codex',
            },
          },
        },
      },
      source: { kind: 'codexHome', home: 'connectedService', connectedServiceId: 'openai-codex' },
      titleHint: 'Codex linked session',
      directoryHint: '/repo',
      nowMs: () => 123,
    });

    const createdMetadata = getOrCreateSessionByTagMock.mock.calls[0]?.[0]?.metadata;
    expect(createdMetadata).toMatchObject({
      codexSessionId: 'thread_runtime',
      codexBackendMode: 'appServer',
      agentRuntimeDescriptorV1: {
        provider: {
          backendMode: 'appServer',
          vendorSessionId: 'thread_runtime',
          home: 'connectedService',
          connectedServiceId: 'openai-codex',
        },
      },
      directSessionV1: {
        source: {
          kind: 'codexHome',
          home: 'connectedService',
          connectedServiceId: 'openai-codex',
        },
      },
    });
  });

  it('normalizes legacy codex backend aliases when linking direct sessions without a runtime descriptor', async () => {
    getOrCreateSessionByTagMock.mockResolvedValueOnce({
      session: {
        id: 'sess_direct_alias',
        metadata: {},
      },
    });

    await ensureDirectSessionLink({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: new Uint8Array([1]) } },
      machineId: 'machine_1',
      providerId: 'codex',
      remoteSessionId: 'thread_alias',
      codexBackendMode: legacyCodexBackendMode,
      source: { kind: 'codexHome', home: 'user' },
      titleHint: 'Codex linked session',
      directoryHint: '/repo',
      nowMs: () => 123,
    });

    const createdMetadata = getOrCreateSessionByTagMock.mock.calls[0]?.[0]?.metadata;
    expect(createdMetadata).toMatchObject({
      codexSessionId: 'thread_alias',
      codexBackendMode: 'acp',
      agentRuntimeDescriptorV1: {
        providerId: 'codex',
        provider: {
          backendMode: 'acp',
          vendorSessionId: 'thread_alias',
        },
      },
    });
  });









});
