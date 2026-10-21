import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The transcript cache holds decrypted message content, so the first contract is about bytes at
 * rest (native: only an encrypted MMKV instance; no key → nothing written), the second about the
 * bounds that keep it a projection (per-record window stays contiguous with `maxSeq`, LRU caps),
 * and the third about never trusting a record it cannot validate.
 *
 * MMKV is faked locally because the contract under test is the construction of the store — which
 * instance, with which `encryptionKey` — which the shared stub deliberately ignores.
 */

type MmkvConfig = Readonly<{ id?: string; encryptionKey?: string }>;

const constructed: MmkvConfig[] = [];
const stores = new Map<string, Map<string, string>>();

vi.mock('react-native-mmkv', () => {
    class MMKV {
        private readonly store: Map<string, string>;

        constructor(config?: MmkvConfig) {
            constructed.push(config ?? {});
            const id = config?.id ?? 'mmkv.default';
            const existing = stores.get(id);
            this.store = existing ?? new Map<string, string>();
            if (!existing) stores.set(id, this.store);
        }

        getString(key: string): string | undefined {
            return this.store.get(key);
        }

        set(key: string, value: string): void {
            this.store.set(key, value);
        }

        delete(key: string): void {
            this.store.delete(key);
        }

        getAllKeys(): string[] {
            return [...this.store.keys()];
        }

        clearAll(): void {
            this.store.clear();
        }

        trim(): void {}
    }
    return { MMKV };
});

const SCOPE = { serverId: 'server-a', accountId: 'account-a' } as const;
const SECRET_TEXT = 'decrypted message that must not sit on disk in the clear';

function message(seq: number, text = `message ${seq}`) {
    return {
        message: {
            id: `m${seq}`,
            seq,
            localId: null,
            createdAt: seq,
            isSidechain: false,
            role: 'user' as const,
            content: { type: 'text' as const, text },
        },
        updatedAt: seq,
    };
}

function record(sessionId: string, seqs: readonly number[], text?: string) {
    return {
        sessionId,
        savedAt: 1,
        maxSeq: Math.max(...seqs),
        minSeq: Math.min(...seqs),
        hasMoreOlder: false,
        session: null,
        messages: seqs.map((seq) => message(seq, text)),
    };
}

async function importPersistence() {
    return await import('./transcriptCachePersistence');
}

describe('transcriptCachePersistence', () => {
    beforeEach(() => {
        vi.resetModules();
        constructed.length = 0;
        stores.clear();
    });

    it('writes decrypted transcripts only through an encrypted MMKV instance on native', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();

        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', [1, 2], SECRET_TEXT));

        const holders = [...stores.entries()].filter(([, store]) => (
            [...store.values()].some((value) => value.includes(SECRET_TEXT))
        ));
        expect(holders.map(([id]) => id)).toEqual([persistence.TRANSCRIPT_CACHE_STORAGE_ID]);
        const config = constructed.find((entry) => entry.id === persistence.TRANSCRIPT_CACHE_STORAGE_ID);
        expect(config?.encryptionKey ?? '').not.toBe('');
        const loaded = await persistence.loadTranscriptCacheRecord(SCOPE, 's1');
        expect(loaded.kind === 'hit' ? loaded.record.messages.map((entry) => entry.message.id) : []).toEqual(['m1', 'm2']);
    });

    it('persists nothing on native until the keystore key is resolved', async () => {
        const persistence = await importPersistence();

        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', [1], SECRET_TEXT));

        expect([...stores.values()].flatMap((store) => [...store.values()]).join('')).not.toContain(SECRET_TEXT);
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's1')).kind).toBe('miss');
    });

    it('keeps the newest contiguous messages when a record exceeds its size cap', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();
        const big = 'x'.repeat(40 * 1024);
        const seqs = Array.from({ length: 30 }, (_unused, index) => index + 1);

        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', seqs, big));

        const loaded = await persistence.loadTranscriptCacheRecord(SCOPE, 's1');
        if (loaded.kind !== 'hit') throw new Error('expected a hit');
        const keptSeqs = loaded.record.messages.map((entry) => entry.message.seq);
        expect(keptSeqs.length).toBeGreaterThan(0);
        expect(keptSeqs.length).toBeLessThan(30);
        // Contiguous with the head: the delta fetch must never resume above a hole.
        expect(keptSeqs[keptSeqs.length - 1]).toBe(30);
        expect(keptSeqs).toEqual(seqs.slice(30 - keptSeqs.length));
        expect(loaded.record.minSeq).toBe(keptSeqs[0]);
        expect(loaded.record.hasMoreOlder).toBe(true);
    });

    it('evicts the least recently used sessions beyond the record cap', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();
        const now = vi.spyOn(Date, 'now');
        const total = persistence.TRANSCRIPT_CACHE_MAX_RECORDS + 2;
        for (let index = 0; index < total; index += 1) {
            now.mockReturnValue(1_000 + index);
            await persistence.saveTranscriptCacheRecord(SCOPE, record(`s${index}`, [1]));
        }
        now.mockRestore();

        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's0')).kind).toBe('miss');
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's1')).kind).toBe('miss');
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, `s${total - 1}`)).kind).toBe('hit');
    });

    it('never answers a read from another server or account scope', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();

        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', [1]));

        expect((await persistence.loadTranscriptCacheRecord({ ...SCOPE, accountId: 'account-b' }, 's1')).kind).toBe('miss');
        expect((await persistence.loadTranscriptCacheRecord({ ...SCOPE, serverId: 'server-b' }, 's1')).kind).toBe('miss');
    });

    it('deletes a record written by an incompatible schema instead of replaying it', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();
        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', [1]));
        const store = stores.get(persistence.TRANSCRIPT_CACHE_STORAGE_ID);
        const key = [...(store?.keys() ?? [])].find((entry) => entry.endsWith(':s1'));
        if (!store || !key) throw new Error('expected a persisted record');
        const raw = JSON.parse(store.get(key) ?? '{}') as Record<string, unknown>;
        store.set(key, JSON.stringify({ ...raw, v: persistence.TRANSCRIPT_CACHE_SCHEMA_VERSION + 1 }));

        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's1')).kind).toBe('invalid');
        expect(store.has(key)).toBe(false);
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's1')).kind).toBe('miss');
    });

    it('discards one session across scopes and clears everything on sign-out', async () => {
        await (await import('./warmCacheEncryptionKey')).prepareWarmCacheEncryptionKey();
        const persistence = await importPersistence();
        const otherScope = { serverId: 'server-b', accountId: 'account-b' };
        await persistence.saveTranscriptCacheRecord(SCOPE, record('s1', [1]));
        await persistence.saveTranscriptCacheRecord(otherScope, record('s1', [1]));
        await persistence.saveTranscriptCacheRecord(SCOPE, record('s2', [1]));

        await persistence.discardTranscriptCacheSession('s1');
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's1')).kind).toBe('miss');
        expect((await persistence.loadTranscriptCacheRecord(otherScope, 's1')).kind).toBe('miss');
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's2')).kind).toBe('hit');

        await persistence.clearTranscriptCache();
        expect((await persistence.loadTranscriptCacheRecord(SCOPE, 's2')).kind).toBe('miss');
        expect(stores.get(persistence.TRANSCRIPT_CACHE_STORAGE_ID)?.size ?? 0).toBe(0);
    });
});
