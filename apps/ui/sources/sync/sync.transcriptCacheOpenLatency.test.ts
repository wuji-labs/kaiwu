import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Acceptance budget for the durable transcript cache: reopening a released session must paint
// from disk in well under the 100 ms a user perceives as instant (budget: 50 ms to first paint), while the network is held
// (so the paint provably did not wait on it), at the deepest window web/desktop keeps.

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
    WEB_TRANSCRIPT_CACHE_BOUNDS,
    setTranscriptCacheBackendForTests,
    setTranscriptCacheBoundsForTests,
    type TranscriptCacheBackend,
} from './domains/state/transcriptCachePersistence';
import { registerSessionVisibleSurface } from './domains/session/activeViewingSession';

type SyncTestAccess = {
    encryption: { getSessionEncryption: (sessionId: string) => null };
    activeServerSessionIds: Set<string>;
    hasFetchedSessionsSnapshotForActiveServer: boolean;
    isForeground: boolean;
    serverID: string;
    credentials: { token: string; secret: string };
    evictSessionTranscript: (sessionId: string) => void;
};

const initialStorageState = storage.getState();
const SESSION_ID = 's-open-latency';
const MESSAGES = WEB_TRANSCRIPT_CACHE_BOUNDS.maxMessagesPerRecord;
const OPEN_BUDGET_MS = 50;

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

function createSession(seq: number): Session {
    const now = Date.now();
    return {
        id: SESSION_ID,
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

// ~1.5 KB of mixed CJK/ASCII per message: the shape of real agent conversations.
const BODY = '这是一段真实对话长度的消息正文，包含中文与 English mixed content。'.repeat(24);

function apiMessage(seq: number) {
    return {
        id: `m${seq}`,
        seq,
        localId: null,
        sidechainId: null,
        content: { t: 'plain', v: { role: 'user', content: { type: 'text', text: `${seq} ${BODY}` } } },
        createdAt: seq,
        updatedAt: seq,
    };
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('durable transcript cache open latency', () => {
    beforeEach(() => {
        storage.setState(initialStorageState, true);
        requestMock.mockReset();
        setTranscriptCacheBackendForTests(createMemoryBackend());
        setTranscriptCacheBoundsForTests(WEB_TRANSCRIPT_CACHE_BOUNDS);
    });

    afterEach(async () => {
        (await import('./sync')).sync.disconnectServer();
        await settle();
        setTranscriptCacheBackendForTests(undefined);
        setTranscriptCacheBoundsForTests(undefined);
    });

    it(`paints a ${MESSAGES}-message transcript from disk within ${OPEN_BUDGET_MS} ms with the network held`, async () => {
        const { sync } = await import('./sync');
        const syncForTest = sync as unknown as SyncTestAccess;
        sync.disconnectServer();
        storage.getState().applySessions([createSession(MESSAGES)]);
        syncForTest.encryption = { getSessionEncryption: () => null };
        syncForTest.activeServerSessionIds = new Set<string>([SESSION_ID]);
        syncForTest.hasFetchedSessionsSnapshotForActiveServer = true;
        syncForTest.isForeground = true;
        syncForTest.serverID = 'account-1';
        syncForTest.credentials = { token: 'token-1', secret: '' };

        // The window the persisted record keeps is what memory held: load the deep window once.
        requestMock.mockImplementation(() => Promise.resolve(jsonResponse({
            messages: Array.from({ length: MESSAGES }, (_unused, index) => apiMessage(MESSAGES - index)),
            hasMore: false,
            nextBeforeSeq: null,
        })));
        await (sync as unknown as {
            refreshSessionMessages: (sessionId: string, options?: { limit?: number }) => Promise<void>;
        }).refreshSessionMessages(SESSION_ID);

        const samples: number[] = [];
        const firstPaintCounts: number[] = [];
        for (let run = 0; run < 7; run += 1) {
            syncForTest.evictSessionTranscript(SESSION_ID);
            await settle();
            expect(storage.getState().sessionMessages[SESSION_ID]?.isLoaded ?? false).toBe(false);

            requestMock.mockReset();
            requestMock.mockImplementation(() => new Promise<Response>(() => {}));
            const release = registerSessionVisibleSurface(SESSION_ID);
            const startedAt = performance.now();
            void sync.refreshSessionMessages(SESSION_ID);
            await expect.poll(
                () => storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0,
                { timeout: 2_000, interval: 1 },
            ).toBeGreaterThan(0);
            samples.push(performance.now() - startedAt);
            // The newest message is in the first frame; the rest of the window follows.
            firstPaintCounts.push(storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0);
            await expect.poll(
                () => storage.getState().sessionMessages[SESSION_ID]?.messageIdsOldestFirst.length ?? 0,
                { timeout: 2_000, interval: 1 },
            ).toBe(MESSAGES);
            release();
        }

        // The first run pays module warm-up; budget the steady state the user lives in.
        const steady = samples.slice(1).sort((left, right) => left - right);
        const worst = steady[steady.length - 1];
        console.log(`[open-latency] ${MESSAGES} messages, first paint ms: ${samples.map((value) => value.toFixed(1)).join(', ')} (messages at first paint: ${firstPaintCounts.join(', ')})`);
        expect(worst).toBeLessThan(OPEN_BUDGET_MS);
    });
});
