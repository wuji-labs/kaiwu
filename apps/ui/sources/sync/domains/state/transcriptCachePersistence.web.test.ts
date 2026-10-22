import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Web/Tauri placement: transcripts go to IndexedDB, never to the `localStorage`-backed MMKV web
 * store, whose ~5 MB origin budget is shared with the credential itself.
 *
 * Node has no IndexedDB, so this is a minimal in-memory stand-in for exactly the platform surface
 * the backend uses (open/upgrade, one object store, get/put/delete/clear, transaction completion).
 */

type Listener = (() => void) | null;

class FakeRequest<T> {
    result!: T;
    error: unknown = null;
    onsuccess: Listener = null;
    onerror: Listener = null;
    onupgradeneeded: Listener = null;
}

function createFakeIndexedDb() {
    const data = new Map<string, unknown>();
    let storeCreated = false;
    const database = {
        objectStoreNames: { contains: () => storeCreated },
        createObjectStore: () => {
            storeCreated = true;
        },
        transaction: () => {
            const transaction = {
                oncomplete: null as Listener,
                onerror: null as Listener,
                onabort: null as Listener,
                error: null,
                objectStore: () => {
                    const respond = <T>(compute: () => T) => {
                        const request = new FakeRequest<T>();
                        queueMicrotask(() => {
                            request.result = compute();
                            request.onsuccess?.();
                            queueMicrotask(() => transaction.oncomplete?.());
                        });
                        return request;
                    };
                    return {
                        get: (key: string) => respond(() => data.get(key)),
                        put: (value: unknown, key: string) => respond(() => {
                            data.set(key, value);
                            return key;
                        }),
                        delete: (key: string) => {
                            data.delete(key);
                            queueMicrotask(() => transaction.oncomplete?.());
                            return new FakeRequest<undefined>();
                        },
                        clear: () => respond(() => {
                            data.clear();
                            return undefined;
                        }),
                    };
                },
            };
            return transaction;
        },
    };
    const factory = {
        open: () => {
            const request = new FakeRequest<typeof database>();
            queueMicrotask(() => {
                request.result = database;
                if (!storeCreated) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    };
    return { factory, data };
}

const localStorageWrites: string[] = [];

vi.mock('react-native-mmkv', () => {
    class MMKV {
        set(key: string): void {
            localStorageWrites.push(key);
        }
        getString(): undefined {
            return undefined;
        }
        delete(): void {}
        clearAll(): void {}
        trim(): void {}
    }
    return { MMKV };
});

describe('transcriptCachePersistence on web', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorageWrites.length = 0;
        vi.stubGlobal('window', globalThis as unknown as Window & typeof globalThis);
        vi.stubGlobal('document', {} as Document);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('round-trips a record through IndexedDB and never through the localStorage-backed store', async () => {
        const fake = createFakeIndexedDb();
        vi.stubGlobal('indexedDB', fake.factory);
        const persistence = await import('./transcriptCachePersistence');
        const scope = { serverId: 'server-a', accountId: 'account-a' };

        await persistence.saveTranscriptCacheRecord(scope, {
            sessionId: 's1',
            savedAt: 1,
            maxSeq: 1,
            minSeq: 1,
            hasMoreOlder: false,
            session: null,
            messages: [{
                message: {
                    id: 'm1',
                    seq: 1,
                    localId: null,
                    createdAt: 1,
                    isSidechain: false,
                    role: 'user',
                    content: { type: 'text', text: 'hello' },
                },
                updatedAt: 1,
            }],
        });

        const loaded = await persistence.loadTranscriptCacheRecord(scope, 's1');
        expect(loaded.kind === 'hit' ? loaded.record.messages[0]?.message.id : null).toBe('m1');
        expect([...fake.data.keys()].some((key) => key.endsWith(':s1'))).toBe(true);
        expect(localStorageWrites).toEqual([]);

        await persistence.clearTranscriptCache();
        expect(fake.data.size).toBe(0);
    });

    it('keeps far more sessions on web than the native MMKV budget allows', async () => {
        const fake = createFakeIndexedDb();
        vi.stubGlobal('indexedDB', fake.factory);
        const persistence = await import('./transcriptCachePersistence');
        expect(persistence.readTranscriptCacheBounds()).toBe(persistence.WEB_TRANSCRIPT_CACHE_BOUNDS);
        const scope = { serverId: 'server-a', accountId: 'account-a' };

        // Past the native 30-record cap, every web record is still there.
        const sessions = persistence.NATIVE_TRANSCRIPT_CACHE_BOUNDS.maxRecords + 10;
        for (let index = 0; index < sessions; index += 1) {
            await persistence.saveTranscriptCacheRecord(scope, {
                sessionId: `s${index}`,
                savedAt: index,
                maxSeq: 1,
                minSeq: 1,
                hasMoreOlder: false,
                session: null,
                messages: [{
                    message: {
                        id: `m${index}`,
                        seq: 1,
                        localId: null,
                        createdAt: 1,
                        isSidechain: false,
                        role: 'user',
                        content: { type: 'text', text: 'hello' },
                    },
                    updatedAt: 1,
                }],
            });
        }
        expect((await persistence.loadTranscriptCacheRecord(scope, 's0')).kind).toBe('hit');
        expect(await persistence.listTranscriptCacheSessionIds(scope, 1_000)).toHaveLength(sessions);
    });

    it('degrades to a miss when the runtime has no IndexedDB', async () => {
        vi.stubGlobal('indexedDB', undefined);
        const persistence = await import('./transcriptCachePersistence');
        const scope = { serverId: 'server-a', accountId: 'account-a' };

        await persistence.saveTranscriptCacheRecord(scope, {
            sessionId: 's1',
            savedAt: 1,
            maxSeq: 1,
            minSeq: 1,
            hasMoreOlder: false,
            session: null,
            messages: [],
        });

        expect((await persistence.loadTranscriptCacheRecord(scope, 's1')).kind).toBe('miss');
        expect(localStorageWrites).toEqual([]);
    });
});
