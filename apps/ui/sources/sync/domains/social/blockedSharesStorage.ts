import { useSyncExternalStore } from 'react';
import { getPersistenceStorage } from '@/sync/domains/state/persistence';

const BLOCKED_SHARES_STORAGE_KEY = 'blocked-public-share-tokens-v1';

let cachedBlockedTokens: Set<string> | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            // ignore
        }
    }
}

function loadBlockedTokensFromStorage(): Set<string> {
    if (cachedBlockedTokens) return cachedBlockedTokens;
    try {
        const storage = getPersistenceStorage();
        const raw = storage.getString(BLOCKED_SHARES_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                cachedBlockedTokens = new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0));
                return cachedBlockedTokens;
            }
        }
    } catch {
        // ignore
    }
    cachedBlockedTokens = new Set<string>();
    return cachedBlockedTokens;
}

function saveBlockedTokensToStorage(tokens: Set<string>): void {
    try {
        const storage = getPersistenceStorage();
        storage.set(BLOCKED_SHARES_STORAGE_KEY, JSON.stringify(Array.from(tokens)));
    } catch {
        // ignore
    }
}

export function getBlockedShareTokens(): string[] {
    const tokens = loadBlockedTokensFromStorage();
    return Array.from(tokens);
}

export function isShareTokenBlocked(token: string): boolean {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (!trimmed) return false;
    const tokens = loadBlockedTokensFromStorage();
    return tokens.has(trimmed);
}

export function blockShareToken(token: string): void {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (!trimmed) return;
    const tokens = loadBlockedTokensFromStorage();
    if (!tokens.has(trimmed)) {
        tokens.add(trimmed);
        saveBlockedTokensToStorage(tokens);
        notifyListeners();
    }
}

export function unblockShareToken(token: string): void {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (!trimmed) return;
    const tokens = loadBlockedTokensFromStorage();
    if (tokens.has(trimmed)) {
        tokens.delete(trimmed);
        saveBlockedTokensToStorage(tokens);
        notifyListeners();
    }
}

export function useIsShareTokenBlocked(token: string): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        () => isShareTokenBlocked(token),
        () => isShareTokenBlocked(token),
    );
}

export function resetBlockedSharesStorageForTest(): void {
    cachedBlockedTokens = null;
    listeners.clear();
    try {
        const storage = getPersistenceStorage();
        storage.delete(BLOCKED_SHARES_STORAGE_KEY);
    } catch {
        // ignore
    }
}

export function clearBlockedShareTokensForTests(): void {
    resetBlockedSharesStorageForTest();
}
