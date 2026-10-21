import { MMKV } from 'react-native-mmkv';
import { V2SessionRecordSchema, type V2SessionRecord } from '@happier-dev/protocol';
import { z } from 'zod';

import type { NormalizedMessage } from '@/sync/typesRaw';
import { readStorageScopeFromEnv, scopedStorageId } from '@/utils/system/storageScope';

import { readResolvedWarmCacheEncryptionKey } from './warmCacheEncryptionKey';

/**
 * Durable copy of the transcript tail of recently opened sessions, so that a cold start (or a
 * re-open after the in-memory retention evicted the transcript) paints from disk and then only
 * fetches the delta above the persisted head through the existing `afterSeq` catch-up.
 *
 * It is a projection, never an authority: every record is refreshable from the server, the sync
 * engine reconciles it on every open, and any record that cannot be trusted is dropped rather than
 * repaired. That is why the bounds below can evict freely.
 *
 * At rest the record follows the warm cache's placement rule (`warmCachePersistence.ts`):
 *
 * - **Native** writes into its own MMKV instance, encrypted with the same keystore-held warm-cache
 *   key. Without that key nothing is written or read (cold boot, never plaintext).
 * - **Web / Tauri** writes into IndexedDB, plaintext for the same reason the web warm cache is:
 *   the account secret already lives in `localStorage` there. IndexedDB rather than the
 *   `localStorage`-backed MMKV web store because transcripts are large and `localStorage` is a
 *   ~5 MB per-origin budget shared with the credential itself; overflowing it would throw on the
 *   next credential or settings write.
 */

/**
 * Bump whenever the persisted record shape — including the `NormalizedMessage` shape replayed
 * through `applyMessages` — changes incompatibly. Old records then fail validation and are
 * deleted on first read; a mismatch costs one network fetch and nothing else.
 */
export const TRANSCRIPT_CACHE_SCHEMA_VERSION = 1;

export const TRANSCRIPT_CACHE_STORAGE_ID = 'transcript-cache-v1';
const TRANSCRIPT_CACHE_RECORD_PREFIX = 'transcript';
const TRANSCRIPT_CACHE_INDEX_KEY = 'transcript-index';

/**
 * Bounds, derived from the storage that pays for them. Sizes are measured in UTF-16 code units of
 * the serialized JSON, which tracks bytes for the ASCII-dominated JSON these records are and is
 * what the JS side can measure without encoding.
 *
 * **Native (MMKV).** An encrypted MMKV instance is decrypted into memory in full the first time it
 * is opened, so the total is what the first transcript open after a cold start pays once, and what
 * the app keeps resident afterwards. 8 MiB keeps that to a few tens of milliseconds of native AES
 * on a mid-range phone and a bounded resident cost. 30 sessions × the configured page (150).
 *
 * **Web / Tauri (IndexedDB).** Each record is its own key, read only when that session opens, so
 * the total costs disk (far inside any origin quota), never memory or open latency; only one
 * record's parse sits on the open path. The desktop is where people work across many long agent
 * sessions, so it keeps every session they plausibly return to (300) and a deeper window each
 * (400 messages, the scroll-back a reader reaches before asking for more), with a 4 Mi-char record
 * cap so one session full of tool output cannot crowd out the rest.
 *
 * Either way a session past the bounds simply loads from the network the way every session did
 * before this cache existed.
 */
export type TranscriptCacheBounds = Readonly<{
    maxRecords: number;
    maxRecordChars: number;
    maxTotalChars: number;
    /** Messages kept per session — the window a hydrate replays. */
    maxMessagesPerRecord: number;
}>;

export const NATIVE_TRANSCRIPT_CACHE_BOUNDS: TranscriptCacheBounds = {
    maxRecords: 30,
    maxRecordChars: 512 * 1024,
    maxTotalChars: 8 * 1024 * 1024,
    maxMessagesPerRecord: 150,
};

export const WEB_TRANSCRIPT_CACHE_BOUNDS: TranscriptCacheBounds = {
    maxRecords: 300,
    maxRecordChars: 4 * 1024 * 1024,
    maxTotalChars: 64 * 1024 * 1024,
    maxMessagesPerRecord: 400,
};

export const TRANSCRIPT_CACHE_MAX_RECORDS = NATIVE_TRANSCRIPT_CACHE_BOUNDS.maxRecords;
export const TRANSCRIPT_CACHE_MAX_RECORD_CHARS = NATIVE_TRANSCRIPT_CACHE_BOUNDS.maxRecordChars;
export const TRANSCRIPT_CACHE_MAX_TOTAL_CHARS = NATIVE_TRANSCRIPT_CACHE_BOUNDS.maxTotalChars;

/** The bounds of the storage this runtime persists into. */
export function readTranscriptCacheBounds(): TranscriptCacheBounds {
    return isWebRuntime() ? WEB_TRANSCRIPT_CACHE_BOUNDS : NATIVE_TRANSCRIPT_CACHE_BOUNDS;
}

const NormalizedMessageEnvelopeSchema = z.union([
    z.object({
        role: z.literal('user'),
        content: z.object({ type: z.literal('text'), text: z.string() }).passthrough(),
    }).passthrough(),
    z.object({
        role: z.literal('agent'),
        content: z.array(z.unknown()),
    }).passthrough(),
    z.object({
        role: z.literal('event'),
        content: z.object({ type: z.string() }).passthrough(),
    }).passthrough(),
]).and(z.object({
    id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    localId: z.string().nullable(),
    createdAt: z.number(),
    isSidechain: z.boolean(),
}).passthrough());

const TranscriptCacheMessageSchema = z.object({
    m: NormalizedMessageEnvelopeSchema,
    /** Server `updatedAt` of the row, so a refetch of an unchanged row is not decrypted again. */
    u: z.number().nullable(),
});

const TranscriptCacheRecordSchema = z.object({
    v: z.literal(TRANSCRIPT_CACHE_SCHEMA_VERSION),
    sessionId: z.string().min(1),
    savedAt: z.number(),
    /** Highest contiguous materialized seq — the `afterSeq` the delta fetch resumes from. */
    maxSeq: z.number().int().positive(),
    /** Lowest seq of the contiguous window the record holds — the older-page cursor. */
    minSeq: z.number().int().nonnegative(),
    hasMoreOlder: z.boolean(),
    /** The server's session row, still ciphertext; replayed through the session-by-id decoder. */
    session: V2SessionRecordSchema.nullable(),
    messages: z.array(TranscriptCacheMessageSchema),
});

export type TranscriptCacheMessage = Readonly<{ message: NormalizedMessage; updatedAt: number | null }>;

export type TranscriptCacheRecord = Readonly<{
    sessionId: string;
    savedAt: number;
    maxSeq: number;
    minSeq: number;
    hasMoreOlder: boolean;
    session: V2SessionRecord | null;
    messages: readonly TranscriptCacheMessage[];
}>;

export type TranscriptCacheScope = Readonly<{ serverId: string; accountId: string }>;

const TranscriptCacheIndexSchema = z.record(z.string(), z.object({
    sessionId: z.string(),
    usedAt: z.number(),
    chars: z.number().int().nonnegative(),
}));
type TranscriptCacheIndex = z.infer<typeof TranscriptCacheIndexSchema>;

/** The storage boundary: one string value per key, asynchronous so IndexedDB fits behind it. */
export type TranscriptCacheBackend = Readonly<{
    read: (key: string) => Promise<string | null>;
    write: (key: string, value: string) => Promise<void>;
    remove: (keys: readonly string[]) => Promise<void>;
    clear: () => Promise<void>;
}>;

function isWebRuntime(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function createNativeBackend(): TranscriptCacheBackend | null {
    const encryptionKey = readResolvedWarmCacheEncryptionKey();
    if (!encryptionKey) return null;
    let storage: MMKV;
    try {
        storage = new MMKV({
            id: scopedStorageId(TRANSCRIPT_CACHE_STORAGE_ID, readStorageScopeFromEnv()),
            encryptionKey,
        });
    } catch {
        return null;
    }
    return {
        read: async (key) => storage.getString(key) ?? null,
        write: async (key, value) => {
            storage.set(key, value);
        },
        remove: async (keys) => {
            for (const key of keys) storage.delete(key);
        },
        clear: async () => {
            storage.clearAll();
            storage.trim();
        },
    };
}

const WEB_DATABASE_NAME = 'kaiwu-transcript-cache';
const WEB_OBJECT_STORE = 'records';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function createWebBackend(): TranscriptCacheBackend | null {
    const factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) return null;
    let database: Promise<IDBDatabase> | null = null;
    const open = (): Promise<IDBDatabase> => {
        database ??= new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open(WEB_DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(WEB_OBJECT_STORE)) {
                    request.result.createObjectStore(WEB_OBJECT_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch((error: unknown) => {
            // A failed open must not poison every later call with the same rejected promise.
            database = null;
            throw error;
        });
        return database;
    };
    const withStore = async <T>(
        mode: IDBTransactionMode,
        run: (store: IDBObjectStore) => IDBRequest<T> | null,
    ): Promise<T | null> => {
        const db = await open();
        const transaction = db.transaction(WEB_OBJECT_STORE, mode);
        const done = new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        // A failing request also fails its transaction; the request's rejection is the one surfaced,
        // so the transaction's must not become an unhandled rejection on top of it.
        done.catch(() => undefined);
        const request = run(transaction.objectStore(WEB_OBJECT_STORE));
        const result = request ? await requestToPromise(request) : null;
        await done;
        return result;
    };
    return {
        read: async (key) => {
            const value = await withStore<unknown>('readonly', (store) => store.get(key));
            return typeof value === 'string' ? value : null;
        },
        write: async (key, value) => {
            await withStore('readwrite', (store) => store.put(value, key));
        },
        remove: async (keys) => {
            await withStore('readwrite', (store) => {
                for (const key of keys) store.delete(key);
                return null;
            });
        },
        clear: async () => {
            await withStore('readwrite', (store) => store.clear());
        },
    };
}

let backendOverride: TranscriptCacheBackend | null | undefined;
let webBackend: TranscriptCacheBackend | null | undefined;
let nativeBackend: TranscriptCacheBackend | null = null;

/**
 * `null` means "no durable cache in this runtime right now" and every caller treats it as a miss.
 * The native backend is not latched while the keystore key is unresolved, so a boot that raced
 * ahead of the keystore starts persisting once the key lands.
 */
function resolveBackend(): TranscriptCacheBackend | null {
    if (backendOverride !== undefined) return backendOverride;
    if (isWebRuntime()) {
        if (webBackend === undefined) webBackend = createWebBackend();
        return webBackend;
    }
    nativeBackend ??= createNativeBackend();
    return nativeBackend;
}

/** Test seam for the platform storage boundary (IndexedDB has no Node implementation). */
export function setTranscriptCacheBackendForTests(backend: TranscriptCacheBackend | null | undefined): void {
    backendOverride = backend;
    webBackend = undefined;
    nativeBackend = null;
}

/**
 * Every operation is serialized: the index is read-modify-written, and two interleaved saves
 * would otherwise each write back an index missing the other's record.
 */
let operationChain: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = operationChain.then(operation, operation);
    operationChain = next.catch(() => undefined);
    return next;
}

function recordKey(scope: TranscriptCacheScope, sessionId: string): string {
    return `${TRANSCRIPT_CACHE_RECORD_PREFIX}:${scope.serverId}:${scope.accountId}:${sessionId}`;
}

function normalizeScope(scope: TranscriptCacheScope | null): TranscriptCacheScope | null {
    if (!scope) return null;
    const serverId = String(scope.serverId ?? '').trim();
    const accountId = String(scope.accountId ?? '').trim();
    return serverId && accountId ? { serverId, accountId } : null;
}

/**
 * The index is the only record of which keys exist, so an unreadable index means records could
 * no longer be found to evict or discard. Clearing the whole store is the only answer that cannot
 * leave orphaned (and, after sign-out, unreachable) transcripts behind.
 */
async function readIndex(backend: TranscriptCacheBackend): Promise<TranscriptCacheIndex> {
    const raw = await backend.read(TRANSCRIPT_CACHE_INDEX_KEY);
    if (!raw) return {};
    let parsed: ReturnType<typeof TranscriptCacheIndexSchema.safeParse> | null = null;
    try {
        parsed = TranscriptCacheIndexSchema.safeParse(JSON.parse(raw));
    } catch {
        parsed = null;
    }
    if (parsed?.success) return parsed.data;
    await backend.clear();
    return {};
}

function selectEvictions(index: TranscriptCacheIndex): string[] {
    const bounds = readTranscriptCacheBounds();
    const keys = Object.keys(index).sort((left, right) => index[right].usedAt - index[left].usedAt);
    const evicted: string[] = [];
    let total = 0;
    let kept = 0;
    for (const key of keys) {
        const chars = index[key].chars;
        if (kept >= bounds.maxRecords || total + chars > bounds.maxTotalChars) {
            evicted.push(key);
            continue;
        }
        kept += 1;
        total += chars;
    }
    return evicted;
}

function toPersistedMessages(messages: readonly TranscriptCacheMessage[]) {
    return messages.map((entry) => ({ m: entry.message, u: entry.updatedAt }));
}

/**
 * Serialize a record, keeping the newest messages that fit the per-record cap. Dropping from the
 * old end keeps the window contiguous with `maxSeq`, so the delta fetch stays gap-free; the
 * dropped range is reported as more older content. Returns `null` when not even the session row
 * plus one message fits.
 */
function serializeBounded(record: TranscriptCacheRecord): string | null {
    const maxRecordChars = readTranscriptCacheBounds().maxRecordChars;
    let messages = [...record.messages].sort((left, right) => (left.message.seq ?? 0) - (right.message.seq ?? 0));
    let hasMoreOlder = record.hasMoreOlder;
    while (messages.length > 0) {
        const minSeq = messages[0].message.seq ?? 0;
        const serialized = JSON.stringify({
            v: TRANSCRIPT_CACHE_SCHEMA_VERSION,
            sessionId: record.sessionId,
            savedAt: record.savedAt,
            maxSeq: record.maxSeq,
            minSeq,
            hasMoreOlder,
            session: record.session,
            messages: toPersistedMessages(messages),
        });
        if (serialized.length <= maxRecordChars) return serialized;
        // Halve the overshoot rather than dropping one message per stringify.
        const keepRatio = maxRecordChars / serialized.length;
        const keep = Math.min(messages.length - 1, Math.floor(messages.length * keepRatio));
        messages = messages.slice(messages.length - Math.max(0, keep));
        hasMoreOlder = true;
    }
    return null;
}

function parseRecord(raw: string, sessionId: string): TranscriptCacheRecord | null {
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return null;
    }
    const parsed = TranscriptCacheRecordSchema.safeParse(json);
    if (!parsed.success || parsed.data.sessionId !== sessionId) return null;
    const data = parsed.data;
    for (const entry of data.messages) {
        if (entry.m.seq > data.maxSeq || entry.m.seq < data.minSeq) return null;
    }
    return {
        sessionId: data.sessionId,
        savedAt: data.savedAt,
        maxSeq: data.maxSeq,
        minSeq: data.minSeq,
        hasMoreOlder: data.hasMoreOlder,
        session: data.session,
        messages: data.messages.map((entry) => ({
            message: entry.m as unknown as NormalizedMessage,
            updatedAt: entry.u,
        })),
    };
}

export type TranscriptCacheLoadResult =
    | Readonly<{ kind: 'hit'; record: TranscriptCacheRecord }>
    | Readonly<{ kind: 'miss' }>
    /** Bytes existed but did not validate (older schema, corruption); they have been deleted. */
    | Readonly<{ kind: 'invalid' }>;

const MISS: TranscriptCacheLoadResult = { kind: 'miss' };

/**
 * The persisted record for one session in one server/account scope. A record that does not
 * validate is deleted here so it is never parsed twice. Storage failures reject; the caller owns
 * reporting them, because a swallowed failure here would be an invisible permanent cold start.
 */
export function loadTranscriptCacheRecord(
    scopeInput: TranscriptCacheScope | null,
    sessionId: string,
): Promise<TranscriptCacheLoadResult> {
    const scope = normalizeScope(scopeInput);
    const backend = resolveBackend();
    if (!scope || !backend || !sessionId) return Promise.resolve(MISS);
    return serialize(async (): Promise<TranscriptCacheLoadResult> => {
        const key = recordKey(scope, sessionId);
        const raw = await backend.read(key);
        if (!raw) return MISS;
        const record = parseRecord(raw, sessionId);
        const index = await readIndex(backend);
        if (!record) {
            delete index[key];
            await backend.remove([key]);
            await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
            return { kind: 'invalid' };
        }
        index[key] = { sessionId, usedAt: Date.now(), chars: raw.length };
        await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
        return { kind: 'hit', record };
    });
}

export function saveTranscriptCacheRecord(
    scopeInput: TranscriptCacheScope | null,
    record: TranscriptCacheRecord,
): Promise<void> {
    const scope = normalizeScope(scopeInput);
    const backend = resolveBackend();
    if (!scope || !backend) return Promise.resolve();
    return serialize(async () => {
        const key = recordKey(scope, record.sessionId);
        const serialized = serializeBounded(record);
        const index = await readIndex(backend);
        if (!serialized) {
            delete index[key];
            await backend.remove([key]);
            await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
            return;
        }
        await backend.write(key, serialized);
        index[key] = { sessionId: record.sessionId, usedAt: Date.now(), chars: serialized.length };
        const evicted = selectEvictions(index);
        for (const evictedKey of evicted) delete index[evictedKey];
        if (evicted.length > 0) await backend.remove(evicted);
        await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
    });
}

/**
 * Drop every persisted copy of a session, in every scope. Used when the copy can no longer be
 * trusted (an edit the cache missed, a deleted or revoked session) — matching by session id
 * across scopes is safe because ids are globally unique and deleting is always allowed.
 */
export function discardTranscriptCacheSession(sessionId: string): Promise<void> {
    const backend = resolveBackend();
    if (!backend || !sessionId) return Promise.resolve();
    return serialize(async () => {
        const index = await readIndex(backend);
        const keys = Object.keys(index).filter((key) => index[key].sessionId === sessionId);
        if (keys.length === 0) return;
        for (const key of keys) delete index[key];
        await backend.remove(keys);
        await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
    });
}

/** Drop every persisted session in one scope except the given ids. */
export function discardTranscriptCacheScopeExcept(
    scopeInput: TranscriptCacheScope | null,
    keepSessionIds: ReadonlySet<string>,
): Promise<void> {
    const scope = normalizeScope(scopeInput);
    const backend = resolveBackend();
    if (!scope || !backend) return Promise.resolve();
    const scopePrefix = `${TRANSCRIPT_CACHE_RECORD_PREFIX}:${scope.serverId}:${scope.accountId}:`;
    return serialize(async () => {
        const index = await readIndex(backend);
        const keys = Object.keys(index).filter((key) => (
            key.startsWith(scopePrefix) && !keepSessionIds.has(index[key].sessionId)
        ));
        if (keys.length === 0) return;
        for (const key of keys) delete index[key];
        await backend.remove(keys);
        await backend.write(TRANSCRIPT_CACHE_INDEX_KEY, JSON.stringify(index));
    });
}

/**
 * Sessions with a durable copy in one scope, most recently used first — what a background refresh
 * keeps current, since those are the transcripts the next open will paint from.
 */
export function listTranscriptCacheSessionIds(
    scopeInput: TranscriptCacheScope | null,
    limit: number,
): Promise<string[]> {
    const scope = normalizeScope(scopeInput);
    const backend = resolveBackend();
    if (!scope || !backend || limit <= 0) return Promise.resolve([]);
    const scopePrefix = `${TRANSCRIPT_CACHE_RECORD_PREFIX}:${scope.serverId}:${scope.accountId}:`;
    return serialize(async () => {
        const index = await readIndex(backend);
        return Object.keys(index)
            .filter((key) => key.startsWith(scopePrefix))
            .sort((left, right) => index[right].usedAt - index[left].usedAt)
            .slice(0, limit)
            .map((key) => index[key].sessionId);
    });
}

/** Sign-out: every account's transcripts leave the device. */
export function clearTranscriptCache(): Promise<void> {
    const backend = resolveBackend();
    if (!backend) return Promise.resolve();
    return serialize(() => backend.clear());
}
