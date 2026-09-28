import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';

import { createPlainSessionFixture } from '@/testkit/backends/sessionFixtures';
import {
  type ApiSessionSocketStub,
  createApiSessionSocketStub,
} from '@/testkit/backends/apiSessionSocketHarness';
import type { SessionMutationOutbox } from './mutations/createSessionMutationOutbox';

let sessionSocketStub: ApiSessionSocketStub | null = null;
let userSocketStub: ApiSessionSocketStub | null = null;

vi.mock('@/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/persistence')>();
  return {
    ...actual,
    readCredentials: vi.fn(),
  };
});

vi.mock('@/settings/accountSettings/refreshAccountSettingsForMinimumVersion', () => ({
  refreshAccountSettingsForMinimumVersion: vi.fn(),
}));

vi.mock('./sockets', () => ({
  createUserScopedSocket: () => {
    if (!userSocketStub) throw new Error('Missing user socket stub');
    return userSocketStub as any;
  },
}));

vi.mock('./connection/createSessionSocketTransport', () => ({
  createSessionSocketTransport: () => {
    if (!sessionSocketStub) throw new Error('Missing session socket stub');
    return {
      socket: sessionSocketStub as any,
      transport: {
        connect: async () => {},
        disconnect: async () => {},
        destroy: async () => {},
        isConnected: () => sessionSocketStub?.connected === true,
        onConnected: () => () => {},
        onDisconnected: () => () => {},
        onError: () => () => {},
      },
    };
  },
}));

vi.mock('./mutations/createSessionMutationOutbox', () => ({
  createSessionMutationOutbox: (): SessionMutationOutbox => ({
    enqueueSessionTurn: async () => {},
    enqueueTranscriptMessage: async () => ({ persisted: true, delivered: true }),
    enqueueRuntimeActivitySnapshot: async () => ({ persisted: true, delivered: true }),
    setSessionSyncPendingInputServerContract: () => {},
    readRuntimeActivitySnapshotTail: () => ({
      sequence: 1,
      custody: null,
      settlement: {
        identity: { mutationKey: 'runtime-activity-snapshot:s1', admissionOrder: 1 },
        desiredValue: { state: 'idle', activeCount: 0 },
        result: 'applied',
        committedProjection: { state: 'idle', activeCount: 0, observedAt: 1, revision: 1 },
        committedRevision: 1,
      },
    }),
    waitForRuntimeActivitySnapshotTailChange: async () => false,
    awaitReady: async () => {},
    flush: async () => {},
    close: async () => {},
  }),
}));

vi.mock('@happier-dev/connection-supervisor', () => ({
  DEFAULT_MANAGED_CONNECTION_POLICY: {},
  createManagedConnectionSupervisor: (params: { createTransport: () => unknown; onConnected?: () => Promise<void> | void }) => ({
    start: async () => {
      params.createTransport();
      await params.onConnected?.();
    },
    stop: async () => {},
    getState: () => ({ phase: 'online' }),
    reportProbeResult: vi.fn(),
  }),
}));

vi.mock('./sessionMessageCatchUp', () => ({
  catchUpSessionMessagesAfterSeq: vi.fn(async () => {}),
}));

const blockPendingDeliveryMock = vi.fn();
const restorePendingMessageMock = vi.fn();

vi.mock('./pendingQueueV2Transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pendingQueueV2Transport')>();
  return {
    ...actual,
    blockPendingQueueV2Delivery: (...args: unknown[]) => blockPendingDeliveryMock(...args),
    restorePendingQueueV2Message: (...args: unknown[]) => restorePendingMessageMock(...args),
  };
});

let sessionClientModulePromise: Promise<typeof import('./sessionClient')> | null = null;

async function createClient() {
  sessionSocketStub = createApiSessionSocketStub({
    id: 'session-socket',
    connected: true,
    emitWithAck: () => ({ ok: true }),
  });
  userSocketStub = createApiSessionSocketStub({ id: 'user-socket', connected: false });
  sessionClientModulePromise ??= import('./sessionClient');
  const { ApiSessionClient } = await sessionClientModulePromise;
  const fixture = createPlainSessionFixture({ id: 's1' });
  const client = new ApiSessionClient('tok', {
    ...fixture,
    metadata: {
      ...fixture.metadata,
      machineId: 'machine-1',
    },
  } as any);
  (client as unknown as { accountIdPromise: Promise<string> }).accountIdPromise = Promise.resolve('account-1');
  return client;
}

function makeCanonicalClaim(client: any, localId: string) {
  client.canonicalPendingDeliveryByLocalId.set(localId, {
    localId,
    mode: 'provider',
    unresolved: true,
  });
}

describe('SessionClient provider unavailable blocked pending redelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionSocketStub = null;
    userSocketStub = null;
  });

  it('only records localIds when reason is provider_unavailable_before_acceptance AND providerEffect is none', async () => {
    const client = await createClient();
    blockPendingDeliveryMock.mockResolvedValue({ ok: true });

    makeCanonicalClaim(client, 'local-unavailable-none');
    makeCanonicalClaim(client, 'local-unavailable-no-effect');
    makeCanonicalClaim(client, 'local-other-reason');
    makeCanonicalClaim(client, 'local-steer-none');
    makeCanonicalClaim(client, 'local-block-fails');

    // 1. provider_unavailable_before_acceptance + providerEffect: 'none' -> MUST record
    const result1 = await client.blockPendingMessageDelivery({
      localIds: ['local-unavailable-none'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });
    expect(result1).toBe(true);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('local-unavailable-none')).toBe(true);

    // 2. provider_unavailable_before_acceptance without providerEffect: 'none' -> MUST NOT record
    const result2 = await client.blockPendingMessageDelivery({
      localIds: ['local-unavailable-no-effect'],
      reason: 'provider_unavailable_before_acceptance',
    });
    expect(result2).toBe(true);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('local-unavailable-no-effect')).toBe(false);

    // 3. payload_too_large (different reason) -> MUST NOT record
    const result3 = await client.blockPendingMessageDelivery({
      localIds: ['local-other-reason'],
      reason: 'payload_too_large',
    });
    expect(result3).toBe(true);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('local-other-reason')).toBe(false);

    // 4. steering_unavailable with providerEffect: 'none' -> MUST NOT record
    const result4 = await client.blockPendingMessageDelivery({
      localIds: ['local-steer-none'],
      reason: 'steering_unavailable',
      providerEffect: 'none',
    });
    expect(result4).toBe(true);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('local-steer-none')).toBe(false);

    // 5. Block call fails -> MUST NOT record
    blockPendingDeliveryMock.mockRejectedValueOnce(new Error('transport failed'));
    const result5 = await client.blockPendingMessageDelivery({
      localIds: ['local-block-fails'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    }).catch(() => false);
    expect(result5).toBe(false);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('local-block-fails')).toBe(false);

    // Overall set contains exactly the one successful target
    expect(Array.from(client.getProviderUnavailableBlockedPendingLocalIds())).toEqual(['local-unavailable-none']);
  });

  it('redelivers through restore route, removing on success, 404, 409, and retaining on 500', async () => {
    const client = await createClient();
    blockPendingDeliveryMock.mockResolvedValue({ ok: true });

    // Track a message
    makeCanonicalClaim(client, 'msg-success');
    await client.blockPendingMessageDelivery({
      localIds: ['msg-success'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-success')).toBe(true);

    // Success path
    restorePendingMessageMock.mockResolvedValueOnce({
      pendingQueueState: { known: true, pendingCount: 1, pendingBlockedCount: 0, pendingVersion: 5 },
    });
    const successCount = await client.redeliverProviderUnavailableBlockedPendingMessages();
    expect(successCount).toBe(1);
    expect(restorePendingMessageMock).toHaveBeenCalledWith({
      token: 'tok',
      sessionId: 's1',
      localId: 'msg-success',
    });
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-success')).toBe(false);

    // 404 path (already dismissed/deleted on server)
    makeCanonicalClaim(client, 'msg-404');
    await client.blockPendingMessageDelivery({
      localIds: ['msg-404'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });
    const axios404 = new AxiosError('Not Found', '404', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      data: {},
      headers: {},
      config: {} as any,
    });
    restorePendingMessageMock.mockRejectedValueOnce(axios404);
    const count404 = await client.redeliverProviderUnavailableBlockedPendingMessages();
    expect(count404).toBe(0);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-404')).toBe(false);

    // 409 path (conflict / already handled on server)
    makeCanonicalClaim(client, 'msg-409');
    await client.blockPendingMessageDelivery({
      localIds: ['msg-409'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });
    const axios409 = new AxiosError('Conflict', '409', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: {},
      headers: {},
      config: {} as any,
    });
    restorePendingMessageMock.mockRejectedValueOnce(axios409);
    const count409 = await client.redeliverProviderUnavailableBlockedPendingMessages();
    expect(count409).toBe(0);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-409')).toBe(false);

    // 500 path (server/network error: must retain for next attempt)
    makeCanonicalClaim(client, 'msg-500');
    await client.blockPendingMessageDelivery({
      localIds: ['msg-500'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });
    const axios500 = new AxiosError('Internal Error', '500', undefined, undefined, {
      status: 500,
      statusText: 'Internal Error',
      data: {},
      headers: {},
      config: {} as any,
    });
    restorePendingMessageMock.mockRejectedValueOnce(axios500);
    const count500 = await client.redeliverProviderUnavailableBlockedPendingMessages();
    expect(count500).toBe(0);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-500')).toBe(true);
  });

  it('protects against duplicate in-flight redelivery calls for the same localId', async () => {
    const client = await createClient();
    blockPendingDeliveryMock.mockResolvedValue({ ok: true });

    makeCanonicalClaim(client, 'msg-concurrent');
    await client.blockPendingMessageDelivery({
      localIds: ['msg-concurrent'],
      reason: 'provider_unavailable_before_acceptance',
      providerEffect: 'none',
    });

    let resolveRestore: (val: any) => void;
    const restorePromise = new Promise((resolve) => {
      resolveRestore = resolve;
    });
    restorePendingMessageMock.mockReturnValueOnce(restorePromise);

    // Start first redelivery (stays in flight)
    const run1 = client.redeliverProviderUnavailableBlockedPendingMessages();

    // Trigger second redelivery while first is in flight
    const run2 = client.redeliverProviderUnavailableBlockedPendingMessages();

    // The second call immediately finishes with 0 because msg-concurrent is already in flight
    const count2 = await run2;
    expect(count2).toBe(0);
    expect(restorePendingMessageMock).toHaveBeenCalledTimes(1);

    // Now let first finish
    resolveRestore!({ ok: true });
    const count1 = await run1;
    expect(count1).toBe(1);
    expect(client.getProviderUnavailableBlockedPendingLocalIds().has('msg-concurrent')).toBe(false);
  });
});
