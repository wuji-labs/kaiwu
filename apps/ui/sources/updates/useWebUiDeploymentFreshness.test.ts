import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useWebUiDeploymentFreshness } from './useWebUiDeploymentFreshness';
import { apiSocket } from '@/sync/api/session/apiSocket';

// Mock the dependencies
vi.mock('react-native', async () => {
  const actual = await vi.importActual('react-native');
  return {
    ...actual,
    Platform: {
      OS: 'web',
    },
  };
});

vi.mock('@/sync/api/session/apiSocket', () => ({
  apiSocket: {
    onReconnected: vi.fn(() => vi.fn()),
  },
}));

describe('useWebUiDeploymentFreshness', () => {
  let fetchMock: typeof fetch;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch as typeof fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('tries new kaiwu endpoint first, falls back to happier', async () => {
    const TestComponent = () => {
      const { updateAvailable } = useWebUiDeploymentFreshness();
      return React.createElement('div', {}, updateAvailable ? 'UPDATE' : 'NO_UPDATE');
    };

    // First call fails with 404, second call succeeds
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deploymentId: 'test-id' }),
      });

    render(React.createElement(TestComponent));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('/.well-known/happier-ui-deployment', expect.any(Object));
    });
  });

  it('uses kaiwu endpoint if available', async () => {
    const TestComponent = () => {
      const { updateAvailable } = useWebUiDeploymentFreshness();
      return React.createElement('div', {}, updateAvailable ? 'UPDATE' : 'NO_UPDATE');
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ deploymentId: 'kaiwu-test-id' }),
    });

    render(React.createElement(TestComponent));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('handles 204 No Content response', async () => {
    const TestComponent = () => {
      const { updateAvailable } = useWebUiDeploymentFreshness();
      return React.createElement('div', {}, updateAvailable ? 'UPDATE' : 'NO_UPDATE');
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
    });

    render(React.createElement(TestComponent));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/.well-known/kaiwu-ui-deployment', expect.any(Object));
    });
  });

  it('silently handles fetch errors', async () => {
    const TestComponent = () => {
      const { updateAvailable } = useWebUiDeploymentFreshness();
      return React.createElement('div', {}, updateAvailable ? 'UPDATE' : 'NO_UPDATE');
    };

    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    render(React.createElement(TestComponent));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
