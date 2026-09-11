import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWebUiDeploymentFreshness } from './useWebUiDeploymentFreshness';
import { apiSocket } from '@/sync/api/session/apiSocket';

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
    vi.clearAllMocks();
  });

  it('tries new kaiwu endpoint first, falls back to happier', async () => {
    // First call fails with 404, second call succeeds
    const responses = [
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response),
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deploymentId: 'test-id' }) } as Response),
    ];
    let callIndex = 0;
    const fetchMock = vi.fn(() => responses[callIndex++]);
    (globalThis as any).fetch = fetchMock;

    // Call the hook's initialization logic
    useWebUiDeploymentFreshness();

    // Give async operations a moment
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith('/.well-known/happier-ui-deployment', expect.any(Object));
  });

  it('uses kaiwu endpoint if available', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deploymentId: 'kaiwu-test-id' }) } as Response)
    );
    (globalThis as any).fetch = fetchMock;

    useWebUiDeploymentFreshness();

    // Give async operations a moment
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles 204 No Content response', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) } as Response)
    );
    (globalThis as any).fetch = fetchMock;

    useWebUiDeploymentFreshness();

    // Give async operations a moment
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
  });

  it('silently handles fetch errors', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('Network error')));
    (globalThis as any).fetch = fetchMock;

    useWebUiDeploymentFreshness();

    // Give async operations a moment
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalled();
  });
});
