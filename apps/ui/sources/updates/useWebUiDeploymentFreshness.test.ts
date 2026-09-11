import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, standardCleanup, flushHookEffects } from '@/dev/testkit';

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({
        Platform: { OS: 'web' },
    });
});

vi.mock('@/sync/api/session/apiSocket', () => ({
    apiSocket: {
        onReconnected: vi.fn(() => vi.fn()),
    },
}));

describe('useWebUiDeploymentFreshness', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        standardCleanup();
        vi.clearAllMocks();
    });

    it('uses kaiwu endpoint if available and returns 200', async () => {
        const fetchMock = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ deploymentId: 'kaiwu-test-id' }),
            } as Response)
        );
        globalThis.fetch = fetchMock as any;

        const { useWebUiDeploymentFreshness } = await import('./useWebUiDeploymentFreshness');
        const hook = await renderHook(() => useWebUiDeploymentFreshness());
        await flushHookEffects();

        expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to happier endpoint when kaiwu returns 404', async () => {
        const responses = [
            Promise.resolve({
                ok: false,
                status: 404,
                json: () => Promise.resolve({}),
            } as Response),
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ deploymentId: 'happier-test-id' }),
            } as Response),
        ];
        let callIndex = 0;
        const fetchMock = vi.fn(() => responses[callIndex++]);
        globalThis.fetch = fetchMock as any;

        const { useWebUiDeploymentFreshness } = await import('./useWebUiDeploymentFreshness');
        const hook = await renderHook(() => useWebUiDeploymentFreshness());
        await flushHookEffects();

        expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledWith('/.well-known/happier-ui-deployment', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not fallback when kaiwu returns 204 No Content', async () => {
        const fetchMock = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 204,
                json: () => Promise.resolve({}),
            } as Response)
        );
        globalThis.fetch = fetchMock as any;

        const { useWebUiDeploymentFreshness } = await import('./useWebUiDeploymentFreshness');
        const hook = await renderHook(() => useWebUiDeploymentFreshness());
        await flushHookEffects();

        expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('silently handles fetch errors', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('Network error')));
        globalThis.fetch = fetchMock as any;

        const { useWebUiDeploymentFreshness } = await import('./useWebUiDeploymentFreshness');
        const hook = await renderHook(() => useWebUiDeploymentFreshness());
        await flushHookEffects();

        expect(fetchMock).toHaveBeenCalled();
        // Hook should return state with updateAvailable: false
        expect(hook.getCurrent().updateAvailable).toBe(false);
    });
});
