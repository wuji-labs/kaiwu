import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveActiveServerAuthReadinessMock = vi.hoisted(() => vi.fn(async () => ({
  credentials: {
    token: 'valid-token',
    encryption: { type: 'legacy', secret: new Uint8Array(32) },
  },
  authenticated: true,
  credentialState: 'valid' as const,
  unusableReason: null,
  machineId: 'machine-1',
  machineRegistered: true,
})));
const reconcileDefaultFollowingBackgroundServicesAfterAuthenticationMock = vi.hoisted(() =>
  vi.fn(async () => true),
);

vi.mock('@/auth/resolveActiveServerAuthReadiness', () => ({
  resolveActiveServerAuthReadiness: () => resolveActiveServerAuthReadinessMock(),
}));

vi.mock('@/ui/auth', () => ({
  authAndSetupMachineIfNeeded: vi.fn(async () => ({
    machineId: 'machine-1',
    credentials: {
      token: 'valid-token',
      encryption: { type: 'legacy', secret: new Uint8Array(32) },
    },
  })),
}));

vi.mock('@/daemon/controlClient', () => ({
  stopDaemon: vi.fn(async () => {}),
}));

vi.mock('../backgroundServiceFollowUp', () => ({
  reconcileDefaultFollowingBackgroundServicesAfterAuthentication: (..._args: unknown[]) =>
    reconcileDefaultFollowingBackgroundServicesAfterAuthenticationMock(),
}));

vi.mock('@/server/serverSelection', () => ({
  applyServerSelectionFromArgs: async (args: string[]) => args,
}));

vi.mock('@/ui/logger', () => ({
  logger: { debug: vi.fn() },
}));

describe('kaiwu auth login background service convergence', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveActiveServerAuthReadinessMock.mockClear();
    reconcileDefaultFollowingBackgroundServicesAfterAuthenticationMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('checks automatic startup even when stored authentication is already valid', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { handleAuthLogin } = await import('./login');
      await handleAuthLogin([]);

      expect(reconcileDefaultFollowingBackgroundServicesAfterAuthenticationMock).toHaveBeenCalledTimes(1);
      expect(reconcileDefaultFollowingBackgroundServicesAfterAuthenticationMock).toHaveBeenCalledWith({
        restartExisting: false,
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
