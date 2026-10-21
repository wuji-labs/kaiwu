import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Durable transcript cache, through the engine's real entry points: a transcript the engine
// released (bounded retention eviction, or a process restart) must repaint from disk without the
// network and then fetch only the delta above the persisted head through the existing
// `afterSeq` catch-up — never another latest-page snapshot plus a full decrypt.

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({
        Platform: { OS: 'ios' },
        AppState: {
            currentState: 'active',
            addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        },
    });
});

vi.mock('@/log', () => ({
    log: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/voice/context/voiceHooks', () => ({
    voiceHooks: {
        onSessionFocus: vi.fn(),
        onSessionOffline: vi.fn(),
        onSessionOnline: vi.fn(),
        onMessages: vi.fn(),
        onReady: vi.fn(),
        reportContextualUpdate: vi.fn(),
    },
}));

vi.mock('@/track', () => ({
    initializeTracking: vi.fn(),
    tracking: null,
    trackPaywallPresented: vi.fn(),
    trackPaywallPurchased: vi.fn(),
    trackPaywallCancelled: vi.fn(),
    trackPaywallRestored: vi.fn(),
    trackPaywallError: vi.fn(),
}));

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('@/sync/api/session/apiSocket', () => ({
    apiSocket: {
        request: requestMock,
        emitWithAck: vi.fn(),
        send: vi.fn(),
        onMessage: vi.fn(),
        onStatusChange: vi.fn(),
        onReconnected: vi.fn(),
        disconnect: vi.fn(),
        initialize: vi.fn(),
    },
}));

import { storage } from './domains/state/storage';
import type { Session } from './domains/state/storageTypes';
import {
    setTranscriptCacheBackendForTests,
    type TranscriptCacheBackend,
} from './domains/state/transcriptCachePersistence';
import { getActiveServerSnapshot } from './domains/server/serverRuntime';
import { registerSessionVisibleSurface } from './domains/session/activeViewingSession';

type SyncTranscriptCacheTestAccess = {
    encryption: { getSessionEncryption: (sessionId: string) => null };
    activeServerSessionIds: Set<string>;
    hasFetchedSessionsSnapshotForActiveServer: boolean;
    isForeground: boolean;
    serverID: string;
    credentials: { token: string; secret: string };
    sessionMaterializedMaxSeqById: Record<string, number>;
    evictSessionTranscript: (sessionId: string) => void;
};

const initialStorageState = storage.getState();
const SESSION_ID = 's-transcript-cache';

/**
 * IndexedDB / MMKV are the platform boundary; the at-rest placement is covered by the persistence
 * owner's own tests. This stands in for the bytes on disk between "runs".
 */
function createMemoryBackend(): TranscriptCacheBackend & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
        values,
        read: async (key) => values.get(key) ?? null,
        write: async (key, value) => {
            values.set(key, value);
        },
        remove: async (keys) => {
            for (const key of keys) values.delete(key);
        },
        clear: async () => {
            values.clear();
        },
    };
}

function createSession(sessionId: string, seq: number): Session {
    const now = Date.now();
    return {
        id: sessionId,
        seq,
        encryptionMode: 'plain',
        createdAt: now,
        updatedAt: now,
        active: true,
        activeAt: now,
        metadata: null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        optimisticThinkingAt: null,
    };
}

function apiMessage(seq: number) {
    return {
        id: `m${seq}`,
        seq,
        localId: null,
        sidechainId: null,
        content: { t: 'plain', v: { role: 'user', content: { type: 'text', text: `message ${seq}` } } },
        createdAt: seq,
        updatedAt: seq,
    };
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function messagesRequestPaths(): string[] {
    return requestMock.mock.calls
        .map((call) => String(call[0]))
        .filter((path) => path.includes('/messages'));
}

async function settle(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function bootSync() {
    const { sync } = await import('./sync');
    const syncForTest = sync as unknown as SyncTranscriptCacheTestAccess;
    sync.disconnectServer();
    storage.getState().applySessions([createSession(SESSION_ID, 20)]);
    syncForTest.encryption = { getSessionEncryption: () => null };
    syncForTest.activeServerSessionIds = new Set<string>([SESSION_ID]);
    syncForTest.hasFetchedSessionsSnapshotForActiveServer = true;
    syncForTest.isForeground = true;
    syncForTest.serverID = 'account-1';
    syncForTest.credentials = { token: 'token-1', secret: '' };
    return { sync, syncForTest };
}

describe('sync durable transcript cache', () => {
    let backend: ReturnType<typeof createMemoryBackend>;

    beforeEach(() => {
        storage.setState(initialStorageState, true);
        requestMock.mockReset();
        backend = createMemoryBackend();
        setTranscriptCacheBackendForTests(backend);
    });

    afterEach(async () => {
        // Tearing the scope down flushes what memory still holds; keep that in this test's disk.
        (await import('./sync')).sync.disconnectServer();
        await settle();
        setTranscriptCacheBackendForTests(undefined);
    });

    it('repaints an evicted transcript from disk and fetches only the delta above the persisted head', async () => {
        expect(String(getActiveServerSnapshot().serverId ?? '').trim()).not.toBe('');
        const { sync, syncForTest } = await bootSync();

        // First open: the latest page arrives from the network.
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: Array.from({ length: 20 }, (_unused, index) => apiMessage(20 - index)),
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await sync.refreshSessionMessages(SESSION_ID);
        expect(storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst).toHaveLength(20);

        // Bounded retention releases the transcript (same release a process restart implies).
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();
        expect(storage.getState().sessionMessages[SESSION_ID]?.isLoaded ?? false).toBe(false);
        expect(backend.values.size).toBeGreaterThan(0);

        // Reopen: hold the network so the paint can only have come from disk.
        requestMock.mockReset();
        let releaseDelta: (response: Response) => void = () => {};
        requestMock.mockImplementation((path: string) => {
            if (!String(path).includes('afterSeq=20')) {
                return Promise.resolve(jsonResponse({ messages: [], hasMore: false, nextBeforeSeq: null }));
            }
            return new Promise<Response>((resolve) => {
                releaseDelta = resolve;
            });
        });
        storage.getState().applySessions([createSession(SESSION_ID, 21)]);
        const releaseVisibleSurface = registerSessionVisibleSurface(SESSION_ID);
        const reopened = sync.refreshSessionMessages(SESSION_ID);

        await expect.poll(
            () => storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0,
            { timeout: 1000 },
        ).toBe(20);
        expect(storage.getState().sessionMessages[SESSION_ID]?.isLoaded).toBe(true);

        releaseDelta(jsonResponse({ messages: [apiMessage(21)], hasMore: false, nextAfterSeq: null }));
        await reopened;
        releaseVisibleSurface();

        expect(storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst).toHaveLength(21);
        // Only the delta crossed the network: no latest-page snapshot was refetched.
        expect(messagesRequestPaths()).toEqual([expect.stringContaining('afterSeq=20')]);
    });

    it('resumes the delta from the record head even when the persisted materialized head is ahead of it', async () => {
        const { sync, syncForTest } = await bootSync();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: Array.from({ length: 20 }, (_unused, index) => apiMessage(20 - index)),
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await sync.refreshSessionMessages(SESSION_ID);
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();
        // A later run advanced (and flushed) the head without rewriting the transcript record.
        syncForTest.sessionMaterializedMaxSeqById = { ...syncForTest.sessionMaterializedMaxSeqById, [SESSION_ID]: 25 };

        requestMock.mockReset();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({ messages: [], hasMore: false, nextAfterSeq: null })));
        storage.getState().applySessions([createSession(SESSION_ID, 25)]);
        const releaseVisibleSurface = registerSessionVisibleSurface(SESSION_ID);
        try {
            await sync.refreshSessionMessages(SESSION_ID);
        } finally {
            releaseVisibleSurface();
        }

        expect(messagesRequestPaths()[0]).toContain('afterSeq=20');
    });

    it('paints a cold-started session shell and transcript from disk before the session fetch answers', async () => {
        const { sync, syncForTest } = await bootSync();
        const now = Date.now();
        const sessionRow = {
            id: SESSION_ID,
            seq: 2,
            createdAt: now,
            updatedAt: now,
            active: true,
            activeAt: now,
            encryptionMode: 'plain',
            metadata: JSON.stringify({ path: '/repo', host: 'host-a', name: 'Cached title' }),
            metadataVersion: 3,
            agentState: null,
            agentStateVersion: 1,
            dataEncryptionKey: null,
        };
        requestMock.mockImplementation((path: string) => Promise.resolve(String(path).startsWith('/v2/sessions/')
            ? jsonResponse({ session: sessionRow })
            : jsonResponse({ messages: [apiMessage(2), apiMessage(1)], hasMore: false, nextBeforeSeq: null })));
        await sync.ensureSessionVisibleForMessageRoute(SESSION_ID, { forceRefresh: true });
        await sync.refreshSessionMessages(SESSION_ID);
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();

        // Cold start: nothing of the session is in memory, and the network does not answer.
        storage.setState(initialStorageState, true);
        requestMock.mockReset();
        requestMock.mockImplementation(() => new Promise<Response>(() => {}));
        void sync.ensureSessionVisibleForMessageRoute(SESSION_ID);

        await expect.poll(() => storage.getState().sessions[SESSION_ID]?.metadata?.name ?? null, { timeout: 1000 })
            .toBe('Cached title');
        await expect.poll(
            () => storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0,
            { timeout: 1000 },
        ).toBe(2);
    });

    it('fetches one screenful, not the full configured page, on a first open with nothing cached', async () => {
        const { sync } = await bootSync();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({ messages: [apiMessage(1)], hasMore: false, nextBeforeSeq: null })));

        await sync.refreshSessionMessages(SESSION_ID);

        // The stubbed window is 600 dp tall: ceil(600 / 40) rows x 2 messages per row.
        expect(messagesRequestPaths()).toEqual([expect.stringContaining('limit=30')]);
    });

    it('brings recently used sessions up to date in the background and persists the delta', async () => {
        const { sync, syncForTest } = await bootSync();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: Array.from({ length: 20 }, (_unused, index) => apiMessage(20 - index)),
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await sync.refreshSessionMessages(SESSION_ID);
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();

        // The app is backgrounded: network and crypto are quiescent, and nothing is on screen.
        (syncForTest as unknown as { isForeground: boolean }).isForeground = false;
        const { isServerReachabilityNetworkAllowed, setServerReachabilityNetworkAllowed } = await import(
            './runtime/connectivity/serverReachabilitySupervisorPool'
        );
        setServerReachabilityNetworkAllowed(false);
        requestMock.mockReset();
        requestMock.mockImplementation((path: string) => Promise.resolve(String(path).includes('afterSeq=20')
            ? jsonResponse({ messages: [apiMessage(21), apiMessage(22)], hasMore: false, nextAfterSeq: 22 })
            : String(path).includes('/messages')
                ? jsonResponse({ messages: [], hasMore: false, nextAfterSeq: null })
                : jsonResponse({ sessions: [], hasNext: false })));

        const outcome = await (sync as unknown as {
            refreshSessionsInBackground: (params: { deadlineAtMs: number }) => Promise<{ sessions: number; newMessages: number }>;
        }).refreshSessionsInBackground({ deadlineAtMs: Date.now() + 10_000 });

        expect(outcome).toMatchObject({ sessions: 1, newMessages: 2 });
        // Persisted before the task returns, so the next open paints seq 22 without the network.
        const record = [...backend.values.entries()].find(([key]) => key.endsWith(`:${SESSION_ID}`))?.[1];
        expect(JSON.parse(record ?? '{}').maxSeq).toBe(22);
        // Quiescence is restored for the rest of the background period.
        expect(isServerReachabilityNetworkAllowed()).toBe(false);
        setServerReachabilityNetworkAllowed(true);
    });

    it('never paints a persisted copy into a different account scope', async () => {
        const { sync, syncForTest } = await bootSync();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: [apiMessage(2), apiMessage(1)],
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await sync.refreshSessionMessages(SESSION_ID);
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();
        expect(backend.values.size).toBeGreaterThan(0);

        syncForTest.serverID = 'account-2';
        requestMock.mockReset();
        let releaseSnapshot: (response: Response) => void = () => {};
        requestMock.mockImplementation(() => new Promise<Response>((resolve) => {
            releaseSnapshot = resolve;
        }));
        const reopened = sync.refreshSessionMessages(SESSION_ID);
        await settle();
        expect(storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0).toBe(0);
        releaseSnapshot(jsonResponse({ messages: [], hasMore: false, nextBeforeSeq: null }));
        await reopened;
    });

    it('drops the persisted copy when a durable edit arrives for a session that is not in memory', async () => {
        const { sync, syncForTest } = await bootSync();
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: [apiMessage(2), apiMessage(1)],
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await sync.refreshSessionMessages(SESSION_ID);
        syncForTest.evictSessionTranscript(SESSION_ID);
        await settle();
        expect([...backend.values.keys()].some((key) => key.endsWith(`:${SESSION_ID}`))).toBe(true);

        await (sync as unknown as {
            discardUnloadedTranscriptCopiesForRepairs: (repairs: ReadonlyArray<{ sessionId: string }>) => Promise<void>;
        }).discardUnloadedTranscriptCopiesForRepairs([{ sessionId: SESSION_ID }]);

        expect([...backend.values.keys()].some((key) => key.endsWith(`:${SESSION_ID}`))).toBe(false);
    });
});
