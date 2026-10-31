import '@expo/metro-runtime';

declare const require: (id: string) => unknown;

if (typeof window !== 'undefined') {
    try {
        const mod = require('./sources/dev/webHmrOptOut/webHmrOptOut');
        if (typeof mod === 'object' && mod !== null && 'installWebHmrOptOutForWebTab' in mod) {
            const install = (mod as { installWebHmrOptOutForWebTab?: unknown }).installWebHmrOptOutForWebTab;
            if (typeof install === 'function') {
                install({
                    url: new URL(window.location.href),
                    sessionStorage: window.sessionStorage,
                    history: window.history,
                });
            }
        }
    } catch {
        // ignore
    }

    try {
        if (typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== 'undefined' && (globalThis as unknown as { __DEV__?: boolean }).__DEV__) {
            const mod = require('./sources/desktop/mcp/installTauriMcpWebviewDriverScripts');
            if (typeof mod === 'object' && mod !== null && 'installTauriMcpWebviewDriverScripts' in mod) {
                const install = (mod as { installTauriMcpWebviewDriverScripts?: unknown }).installTauriMcpWebviewDriverScripts;
                if (typeof install === 'function') {
                    install();
                }
            }
        }
    } catch {
        // ignore
    }
}

require('./sources/unistyles');

// Background session refresh tasks must be defined before the root renders: the OS may start JS
// only to run one (periodic refresh, push wake). Web has no OS background execution.
// The task modules are native; a binary built before they were added runs the same JS through a
// hot update, so the whole feature stays off there (the durable cache and foreground catch-up do
// not need it) instead of throwing at module evaluation.
const hasBackgroundTaskNativeModules = (): boolean => {
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
        requireOptionalNativeModule: (name: string) => unknown;
    };
    return requireOptionalNativeModule('ExpoBackgroundTask') != null
        && requireOptionalNativeModule('ExpoTaskManager') != null;
};
// iOS: move exceptions swallowed by the patched RCTTurboModule (see drainNativeExceptionLog) into
// reliability telemetry. Deferred so it never changes the module evaluation order of a launch.
if (typeof document === 'undefined') {
    setTimeout(() => {
        try {
            const { Platform, Settings } = require('react-native') as typeof import('react-native');
            if (Platform.OS !== 'ios') return;
            const mod = require('./sources/sync/runtime/drainNativeExceptionLog') as typeof import('./sources/sync/runtime/drainNativeExceptionLog');
            mod.drainNativeExceptionLog(Settings);
        } catch {
            // telemetry only
        }
    }, 5_000);
}

if (typeof document === 'undefined' && hasBackgroundTaskNativeModules()) {
    // React Native defines `window` but never `document`: this is a native build.
    const mod = require('./sources/sync/background/installBackgroundSessionRefresh');
    if (typeof mod === 'object' && mod !== null && 'installBackgroundSessionRefresh' in mod) {
        const install = (mod as { installBackgroundSessionRefresh?: unknown }).installBackgroundSessionRefresh;
        if (typeof install === 'function') {
            install();
        }
    }
}

require('expo-router/entry');
