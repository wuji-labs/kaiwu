import { AppState, Platform } from 'react-native';
import { isTauriDesktop } from '@/utils/platform/tauri';

export function isRuntimeActive(): boolean {
    if (isTauriDesktop()) {
        return true;
    }

    try {
        const appState = String(AppState.currentState ?? '').trim();
        if (appState && appState !== 'active') {
            return false;
        }
    } catch {
        // ignore
    }

    try {
        if (Platform.OS !== 'web') {
            return true;
        }
    } catch {
        // ignore
    }

    try {
        const doc = (globalThis as unknown as { document?: Document }).document;
        if (doc && typeof doc.visibilityState === 'string' && doc.visibilityState === 'hidden') {
            return false;
        }
    } catch {
        // ignore
    }

    return true;
}

function readDocument(): (Document & {
    addEventListener?: Document['addEventListener'];
    removeEventListener?: Document['removeEventListener'];
}) | undefined {
    try {
        return (globalThis as unknown as { document?: Document }).document;
    } catch {
        return undefined;
    }
}

/**
 * Notifies when the runtime's active/inactive state may have changed: the app
 * moved between foreground and background, or (on web) the document was hidden
 * or shown.
 *
 * This is the single owner of "what counts as a lifecycle transition" that
 * `isRuntimeActive` reads. Every gated worker subscribes here instead of
 * attaching its own `AppState` / `visibilitychange` listeners, so a new poller
 * cannot silently ship without a lifecycle gate for want of somewhere to hang
 * one. The listener is called on every transition signal, including ones that
 * leave the state unchanged; a caller that needs edge semantics compares
 * `isRuntimeActive()` itself.
 */
export function subscribeToRuntimeActiveChange(listener: () => void): () => void {
    const detach: Array<() => void> = [];

    const doc = readDocument();
    if (typeof doc?.addEventListener === 'function' && typeof doc.removeEventListener === 'function') {
        doc.addEventListener('visibilitychange', listener);
        detach.push(() => {
            doc.removeEventListener?.('visibilitychange', listener);
        });
    }

    try {
        const subscription = AppState.addEventListener?.('change', listener);
        if (subscription && typeof subscription.remove === 'function') {
            detach.push(() => subscription.remove());
        }
    } catch {
        // ignore
    }

    return () => {
        for (const stop of detach.splice(0)) {
            stop();
        }
    };
}

/**
 * Waits until the JavaScript runtime is active again.
 *
 * Native app backgrounding can suspend the JS thread and the sync owner may
 * intentionally tear down its socket in the same lifecycle transition. Work
 * that can resume safely must wait here instead of turning that transition
 * into a terminal failure.
 */
export function waitForRuntimeActive(): Promise<void> {
    if (isRuntimeActive()) return Promise.resolve();

    return new Promise<void>((resolve) => {
        let settled = false;
        let detach: (() => void) | null = null;

        const finish = () => {
            if (settled) return;
            settled = true;
            detach?.();
            detach = null;
            resolve();
        };

        detach = subscribeToRuntimeActiveChange(() => {
            if (isRuntimeActive()) finish();
        });

        // The runtime may have become active between the first check and
        // listener registration.
        if (isRuntimeActive()) finish();
    });
}

/**
 * Runs an interval only while the runtime is active. If regular ticks were
 * skipped while inactive, the callback runs once immediately when the runtime
 * returns to active and the interval is overdue.
 */
export function startRuntimeActiveGatedInterval(
    tick: () => void,
    intervalMs: number,
): () => void {
    const delayMs = Math.max(1, Math.trunc(intervalMs));
    let stopped = false;
    let lastRunAt = Date.now();

    const runNow = () => {
        if (stopped || !isRuntimeActive()) return;
        lastRunAt = Date.now();
        tick();
    };

    const runIfOverdue = () => {
        if (stopped || !isRuntimeActive()) return;
        const now = Date.now();
        if (now - lastRunAt < delayMs) return;
        lastRunAt = now;
        tick();
    };

    const interval = setInterval(runNow, delayMs);
    const detachLifecycle = subscribeToRuntimeActiveChange(runIfOverdue);

    return () => {
        if (stopped) return;
        stopped = true;
        clearInterval(interval);
        detachLifecycle();
    };
}
