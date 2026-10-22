import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TokenStorage, type AuthCredentials } from '@/auth/storage/tokenStorage';
import { syncSwitchServer } from '@/sync/sync';
import { localSettingsDefaults } from '@/sync/domains/settings/localSettings';
import { clearPersistence, loadLocalSettings, saveLocalSettings } from '@/sync/domains/state/persistence';
import { clearTranscriptCache } from '@/sync/domains/state/transcriptCachePersistence';
import { syncReliabilityTelemetry } from '@/sync/runtime/syncReliabilityTelemetry';
import { useApplyLocalSettings } from '@/sync/store/settingsWriters';
import { trackLogout } from '@/track';
import { subscribeActiveServer } from '@/sync/domains/server/serverRuntime';
import { switchConnectionToActiveServer } from '@/sync/runtime/orchestration/connectionManager';
import { startConcurrentSessionCacheSync, stopConcurrentSessionCacheSync } from '@/sync/runtime/orchestration/concurrentSessionCache';
import { fireAndForget } from '@/utils/system/fireAndForget';

interface AuthContextType {
    isAuthenticated: boolean;
    credentials: AuthCredentials | null;
    login: (token: string, secret: string) => Promise<void>;
    loginWithCredentials: (credentials: AuthCredentials) => Promise<void>;
    logout: () => Promise<void>;
    refreshFromActiveServer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, initialCredentials }: { children: ReactNode; initialCredentials: AuthCredentials | null }) {
    const [isAuthenticated, setIsAuthenticated] = useState(!!initialCredentials);
    const [credentials, setCredentials] = useState<AuthCredentials | null>(initialCredentials);
    const activeServerKeyRef = React.useRef<string | null>(null);
    const applyLocalSettings = useApplyLocalSettings();

    const loginWithCredentials = React.useCallback(async (newCredentials: AuthCredentials) => {
        const success = await TokenStorage.setCredentials(newCredentials);
        if (!success) {
            throw new Error('Failed to save credentials');
        }
        // Mark this device as one where the user has authenticated at least once.
        // We persist this through the store (not raw saveLocalSettings) so the
        // in-memory Zustand `localSettings` slice — which survives logout because
        // clearPersistence only wipes MMKV — also reflects the flag. The welcome
        // screen reads it via useLocalSetting('hasCompletedAuthOnce') to swap to
        // the warmer "Good to have you back" copy on subsequent visits.
        if (!loadLocalSettings().hasCompletedAuthOnce) {
            applyLocalSettings({ hasCompletedAuthOnce: true });
        }
        setCredentials(newCredentials);
        setIsAuthenticated(true);
        fireAndForget(syncSwitchServer(newCredentials), { tag: 'AuthContext.login.syncSwitchServer' });
    }, [applyLocalSettings]);

    const login = React.useCallback(
        async (token: string, secret: string) => {
            const newCredentials: AuthCredentials = { token, secret };
            await loginWithCredentials(newCredentials);
        },
        [loginWithCredentials],
    );

    const logout = React.useCallback(async () => {
        trackLogout();
        // Preserve device-local flags across logout — the user is signing out of
        // an account but the device itself has still seen the brand hero and
        // still has prior auth experience. Clearing these would force returning
        // users back into the first-time welcome copy after every logout.
        const { brandHeroSeenAt, hasCompletedAuthOnce } = loadLocalSettings();
        clearPersistence();
        if (brandHeroSeenAt != null || hasCompletedAuthOnce) {
            saveLocalSettings({
                ...localSettingsDefaults,
                brandHeroSeenAt,
                hasCompletedAuthOnce,
            });
        }
        await TokenStorage.removeCredentials();
        await syncSwitchServer(null);
        // After the switch: tearing the server scope down flushes pending transcripts to disk,
        // and this clear is queued behind those writes, so nothing of the account survives.
        await clearTranscriptCache().catch((error: unknown) => {
            // Never block sign-out on it, but a transcript left behind must be visible.
            syncReliabilityTelemetry.recordCritical('auth.logout.transcriptCacheClearFailed', {
                error: error instanceof Error ? error.name : 'unknown',
            });
        });
        setCredentials(null);
        setIsAuthenticated(false);
    }, []);

    const refreshFromActiveServer = React.useCallback(async () => {
        const nextCredentials = await switchConnectionToActiveServer();
        setCredentials(nextCredentials);
        setIsAuthenticated(Boolean(nextCredentials));
    }, []);

    // Single source of truth for the context value so consumers (and the non-React
    // `getCurrentAuth()` bridge) share one identity-stable object. Without this memo the
    // provider hands every consumer a fresh object on each render, re-rendering all ~50
    // `useAuth()` callers — including the root layout Stack subtree — on unrelated renders.
    const value = React.useMemo<AuthContextType>(() => ({
        isAuthenticated,
        credentials,
        login,
        loginWithCredentials,
        logout,
        refreshFromActiveServer,
    }), [isAuthenticated, credentials, login, loginWithCredentials, logout, refreshFromActiveServer]);

    // Update global auth state when local state changes
    useEffect(() => {
        setCurrentAuth(value);
    }, [value]);

    useEffect(() => {
        const unsubscribe = subscribeActiveServer((snapshot) => {
            const serverKey = `${snapshot.serverId}|${snapshot.serverUrl}`;
            if (activeServerKeyRef.current === serverKey) return;
            activeServerKeyRef.current = serverKey;
            fireAndForget(refreshFromActiveServer(), { tag: 'AuthContext.refreshFromActiveServer' });
        });
        return unsubscribe;
    }, [refreshFromActiveServer]);

    useEffect(() => {
        if (!isAuthenticated) {
            stopConcurrentSessionCacheSync();
            return;
        }
        startConcurrentSessionCacheSync();
        return () => {
            stopConcurrentSessionCacheSync();
        };
    }, [isAuthenticated]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Helper to get current auth state for non-React contexts
let currentAuthState: AuthContextType | null = null;

export function setCurrentAuth(auth: AuthContextType | null) {
    currentAuthState = auth;
}

export function getCurrentAuth(): AuthContextType | null {
    return currentAuthState;
}
