import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RpcHandler, RpcHandlerRegistrar } from '@/api/rpc/types';
import { RPC_METHODS } from '@happier-dev/protocol/rpc';

const { loggerWarnMock, runScmProvisioningRouteMock, runScmRouteMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  runScmProvisioningRouteMock: vi.fn(),
  runScmRouteMock: vi.fn(),
}));

vi.mock('@/scm/rpc/dispatch', () => ({
  createNonRepositoryScmSnapshotResponse: vi.fn(),
  notRepositoryResponse: vi.fn(),
  runScmProvisioningRoute: (...args: unknown[]) => runScmProvisioningRouteMock(...args),
  runScmRoute: (...args: unknown[]) => runScmRouteMock(...args),
}));

vi.mock('@/ui/logger', () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) },
}));

describe('registerScmHandlers status snapshot coalescing', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    loggerWarnMock.mockReset();
    runScmProvisioningRouteMock.mockReset();
    runScmRouteMock.mockReset();
  });

  const registerHandlers = async (): Promise<Map<string, RpcHandler>> => {
    const handlers = new Map<string, RpcHandler>();
    const registrar: RpcHandlerRegistrar = {
      registerHandler(method, handler) {
        handlers.set(method, handler);
      },
    };
    const { registerScmHandlers } = await import('./scm');
    registerScmHandlers(registrar, '/workspace');
    return handlers;
  };

  const expectStaleInFlightStatusToBeSuppressedAfterMutation = async (
    mutationMethod: string,
    mutationRequest: Record<string, unknown>,
    expectedRunCounts: Readonly<{
      route: number;
      provisioning: number;
    }>,
  ): Promise<void> => {
    const handlers = await registerHandlers();
    const statusHandler = handlers.get(RPC_METHODS.SCM_STATUS_SNAPSHOT);
    const mutationHandler = handlers.get(mutationMethod);
    expect(statusHandler).toBeTypeOf('function');
    expect(mutationHandler).toBeTypeOf('function');
    if (!statusHandler || !mutationHandler) throw new Error('SCM handlers were not registered');

    const staleResponse = { success: true, snapshot: { id: 'stale' } };
    const freshResponse = { success: true, snapshot: { id: 'fresh' } };
    const staleStatusResolvers: Array<(response: unknown) => void> = [];

    runScmRouteMock.mockImplementation(({ request }: { request?: Record<string, unknown> }) => {
      if (request?.includeWorktreeStatus === true) {
        return new Promise((resolve) => {
          staleStatusResolvers.push(resolve);
        });
      }
      return Promise.resolve({ success: true });
    });
    runScmProvisioningRouteMock.mockResolvedValue({ success: true });

    const staleStatus = statusHandler({ cwd: '.', includeWorktreeStatus: true });
    await mutationHandler(mutationRequest);
    expect(runScmRouteMock).toHaveBeenCalledTimes(expectedRunCounts.route);
    expect(runScmProvisioningRouteMock).toHaveBeenCalledTimes(expectedRunCounts.provisioning);

    const resolveStaleStatus = staleStatusResolvers.at(0);
    if (!resolveStaleStatus) {
      throw new Error('Expected first status snapshot to be pending');
    }
    resolveStaleStatus(staleResponse);
    await expect(staleStatus).resolves.toBe(staleResponse);

    runScmRouteMock.mockReset();
    runScmProvisioningRouteMock.mockReset();
    runScmRouteMock.mockResolvedValueOnce(freshResponse);
    await expect(statusHandler({ cwd: '.', includeWorktreeStatus: true })).resolves.toBe(freshResponse);
    expect(runScmRouteMock).toHaveBeenCalledTimes(1);
    expect(runScmProvisioningRouteMock).not.toHaveBeenCalled();
  };

  it('shares one in-flight status snapshot for identical requests and reuses the fresh cached result', async () => {
    const handlers = await registerHandlers();
    const handler = handlers.get(RPC_METHODS.SCM_STATUS_SNAPSHOT);
    expect(handler).toBeTypeOf('function');
    if (!handler) throw new Error('SCM status handler was not registered');

    const firstResponse = { success: true, snapshot: { id: 'first' } };
    const pendingResolvers: Array<(response: unknown) => void> = [];
    runScmRouteMock.mockImplementation(
      () => new Promise((resolve) => {
        pendingResolvers.push(resolve);
      }),
    );

    const first = handler({ cwd: '.', includeWorktreeStatus: true });
    const second = handler({ cwd: '.', includeWorktreeStatus: true });
    try {
      expect(runScmRouteMock).toHaveBeenCalledTimes(1);
    } finally {
      for (const resolve of pendingResolvers) {
        resolve(firstResponse);
      }
    }
    await expect(Promise.all([first, second])).resolves.toEqual([firstResponse, firstResponse]);

    const secondResponse = { success: true, snapshot: { id: 'second' } };
    runScmRouteMock.mockReset();
    runScmRouteMock.mockResolvedValueOnce(secondResponse);
    await expect(handler({ cwd: '.', includeWorktreeStatus: true })).resolves.toBe(firstResponse);
    expect(runScmRouteMock).not.toHaveBeenCalled();
  });

  it('does not reuse stale in-flight status snapshots after mutating RPCs', async () => {
    const handlers = await registerHandlers();
    const statusHandler = handlers.get(RPC_METHODS.SCM_STATUS_SNAPSHOT);
    const discardHandler = handlers.get(RPC_METHODS.SCM_CHANGE_DISCARD);
    expect(statusHandler).toBeTypeOf('function');
    expect(discardHandler).toBeTypeOf('function');
    if (!statusHandler || !discardHandler) throw new Error('SCM handlers were not registered');

    const staleResponse = { success: true, snapshot: { id: 'stale' } };
    const freshResponse = { success: true, snapshot: { id: 'fresh' } };
    const staleStatusResolvers: Array<(response: unknown) => void> = [];

    runScmRouteMock.mockImplementation(({ request }: { request?: Record<string, unknown> }) => {
      if (request?.includeWorktreeStatus === true) {
        return new Promise((resolve) => {
          staleStatusResolvers.push(resolve);
        });
      }
      return Promise.resolve({ success: true });
    });

    const staleStatus = statusHandler({ cwd: '.', includeWorktreeStatus: true });
    await discardHandler({ cwd: '.', changes: [{ path: 'file.txt' }] });
    expect(runScmRouteMock).toHaveBeenCalledTimes(2);

    const resolveStaleStatus = staleStatusResolvers.at(0);
    if (!resolveStaleStatus) {
      throw new Error('Expected first status snapshot to be pending');
    }
    resolveStaleStatus(staleResponse);
    await expect(staleStatus).resolves.toBe(staleResponse);

    runScmRouteMock.mockReset();
    runScmRouteMock.mockResolvedValueOnce(freshResponse);
    await expect(statusHandler({ cwd: '.', includeWorktreeStatus: true })).resolves.toBe(freshResponse);
    expect(runScmRouteMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse stale in-flight status snapshots after split pull-request mutations', async () => {
    await expectStaleInFlightStatusToBeSuppressedAfterMutation(
      RPC_METHODS.SCM_PULL_REQUEST_OPEN_OR_REUSE,
      { cwd: '.', title: 'Fix cache invalidation' },
      { route: 2, provisioning: 0 },
    );
  });

  it('does not reuse stale in-flight status snapshots after split repository provisioning mutations', async () => {
    await expectStaleInFlightStatusToBeSuppressedAfterMutation(
      RPC_METHODS.SCM_REPOSITORY_INIT,
      { cwd: '.' },
      { route: 1, provisioning: 1 },
    );
  });

  it('shares one in-flight worktree enrichment and reuses its cached result', async () => {
    const handlers = await registerHandlers();
    const handler = handlers.get(RPC_METHODS.SCM_WORKTREES_ENRICHMENT);
    expect(handler).toBeTypeOf('function');
    if (!handler) throw new Error('SCM enrichment handler was not registered');

    const response = { success: true, worktrees: [{ path: '/repo', changeCount: 2 }] };
    let resolvePending: ((value: unknown) => void) | undefined;
    runScmRouteMock.mockImplementation(() => new Promise((resolve) => {
      resolvePending = resolve;
    }));

    const first = handler({ cwd: '.', worktreePaths: ['/repo'] });
    const second = handler({ cwd: '.', worktreePaths: ['/repo'] });
    expect(runScmRouteMock).toHaveBeenCalledTimes(1);
    resolvePending?.(response);
    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);

    runScmRouteMock.mockReset();
    await expect(handler({ cwd: '.', worktreePaths: ['/repo'] })).resolves.toBe(response);
    expect(runScmRouteMock).not.toHaveBeenCalled();
  });

  it('returns a bounded enrichment projection and logs when the scan exceeds its timeout', async () => {
    vi.useFakeTimers();
    vi.stubEnv('HAPPIER_SCM_WORKTREES_ENRICHMENT_TIMEOUT_MS', '25');
    const handlers = await registerHandlers();
    const handler = handlers.get(RPC_METHODS.SCM_WORKTREES_ENRICHMENT);
    expect(handler).toBeTypeOf('function');
    if (!handler) throw new Error('SCM enrichment handler was not registered');
    runScmRouteMock.mockImplementation(() => new Promise(() => undefined));

    const result = handler({ cwd: '.', worktreePaths: ['/repo'] });
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      success: true,
      worktrees: [{ path: '/repo' }],
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('SCM worktrees enrichment timed out'),
      expect.objectContaining({ timeoutMs: 25 }),
    );
  });

  it('abandons a timed-out enrichment scan so the next poll starts a fresh one', async () => {
    vi.useFakeTimers();
    vi.stubEnv('HAPPIER_SCM_WORKTREES_ENRICHMENT_TIMEOUT_MS', '25');
    const handlers = await registerHandlers();
    const handler = handlers.get(RPC_METHODS.SCM_WORKTREES_ENRICHMENT);
    expect(handler).toBeTypeOf('function');
    if (!handler) throw new Error('SCM enrichment handler was not registered');

    const scanResolvers: Array<(value: unknown) => void> = [];
    runScmRouteMock.mockImplementation(() => new Promise((resolve) => {
      scanResolvers.push(resolve);
    }));

    const timedOut = handler({ cwd: '.', worktreePaths: ['/repo'] });
    await vi.advanceTimersByTimeAsync(25);
    await expect(timedOut).resolves.toEqual({
      success: true,
      worktrees: [{ path: '/repo' }],
    });
    expect(runScmRouteMock).toHaveBeenCalledTimes(1);

    // The next poll must not share the overrunning scan; it starts its own.
    const nextPoll = handler({ cwd: '.', worktreePaths: ['/repo'] });
    expect(runScmRouteMock).toHaveBeenCalledTimes(2);

    // The abandoned scan settling late must not repopulate the cache.
    scanResolvers[0]?.({ success: true, worktrees: [{ path: '/repo', changeCount: 1 }] });
    await Promise.resolve();
    scanResolvers[1]?.({ success: true, worktrees: [{ path: '/repo', changeCount: 9 }] });
    await expect(nextPoll).resolves.toEqual({
      success: true,
      worktrees: [{ path: '/repo', changeCount: 9 }],
    });

    const cached = await handler({ cwd: '.', worktreePaths: ['/repo'] });
    expect(cached).toEqual({ success: true, worktrees: [{ path: '/repo', changeCount: 9 }] });
    expect(runScmRouteMock).toHaveBeenCalledTimes(2);
  });
});
