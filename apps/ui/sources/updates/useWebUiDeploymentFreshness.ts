import * as React from 'react';
import { Platform } from 'react-native';
import { apiSocket } from '@/sync/api/session/apiSocket';
import { reduceUiDeploymentFreshness, type UiDeploymentFreshnessState } from './uiDeploymentFreshness';

const INITIAL: UiDeploymentFreshnessState = { baselineId: null, updateAvailable: false };

export function useWebUiDeploymentFreshness(): Readonly<{ updateAvailable: boolean; reload: () => void }> {
    const [state, setState] = React.useState(INITIAL);
    const check = React.useCallback(async () => {
        if (Platform.OS !== 'web' || typeof globalThis.fetch !== 'function') return;
        try {
            // Try new kaiwu endpoint first, fall back to legacy happier endpoint
            let response = await globalThis.fetch('/.well-known/kaiwu-ui-deployment', { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok && response.status === 404) {
                response = await globalThis.fetch('/.well-known/happier-ui-deployment', { cache: 'no-store', credentials: 'same-origin' });
            }
            if (!response.ok || response.status === 204) return;
            const payload = await response.json() as { deploymentId?: unknown };
            setState((current) => reduceUiDeploymentFreshness(current, payload.deploymentId));
        } catch {
            // Missing, malformed, and temporarily unavailable identities are intentionally silent.
        }
    }, []);
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        void check();
        const unsubscribe = apiSocket.onReconnected(() => void check());
        const doc = (globalThis as { document?: Document }).document;
        const onVisibility = () => { if (!doc || doc.visibilityState === 'visible') void check(); };
        doc?.addEventListener('visibilitychange', onVisibility);
        return () => { unsubscribe(); doc?.removeEventListener('visibilitychange', onVisibility); };
    }, [check]);
    const reload = React.useCallback(() => {
        if (Platform.OS === 'web') (globalThis as { location?: { reload?: () => void } }).location?.reload?.();
    }, []);
    return { updateAvailable: state.updateAvailable, reload };
}
