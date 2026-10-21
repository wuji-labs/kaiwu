import {
    defineBackgroundSessionRefreshTasks,
    registerBackgroundSessionRefreshTasks,
    type BackgroundRefreshDependencies,
} from './backgroundSessionRefresh';

/**
 * App-entry wiring for the background session refresh (native only; `index.ts` skips web).
 *
 * Runs before the root layout so the OS can start JS solely for a task. The sync engine and the
 * boot legs are imported lazily inside the task body: a task wake must not pay for them twice, and
 * the entry must not change the module evaluation order of a normal launch.
 */
function createDependencies(): BackgroundRefreshDependencies {
    return {
        ensureSyncReady: async () => {
            const [{ ensureSyncRestoredForBackgroundWork }, { default: sodium }, { prepareWarmCacheStorage }, { resolveBootCredentials }, { Platform }] = await Promise.all([
                import('@/sync/sync'),
                import('@/encryption/libsodium.lib'),
                import('@/sync/domains/state/warmCachePersistence'),
                import('@/boot/resolveBootCredentials'),
                import('react-native'),
            ]);
            return await ensureSyncRestoredForBackgroundWork({
                resolveCredentials: () => resolveBootCredentials(Platform.OS),
                prepareWarmCache: prepareWarmCacheStorage,
                sodiumReady: sodium.ready,
            });
        },
        refreshSessionsInBackground: async (params) => {
            const { sync } = await import('@/sync/sync');
            return await sync.refreshSessionsInBackground(params);
        },
    };
}

export function installBackgroundSessionRefresh(): void {
    defineBackgroundSessionRefreshTasks(createDependencies);
    void registerBackgroundSessionRefreshTasks();
}
