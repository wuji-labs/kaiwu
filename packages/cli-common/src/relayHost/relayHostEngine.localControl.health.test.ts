import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import { resolveRelayRuntimeDefaults } from '../firstPartyRuntime/relayRuntime.js';

// The engine builds paths with the host path module while the linux-simulating tests match POSIX
// paths in mocked fs predicates; normalise separators (identity on POSIX hosts and win32 simulations).
const toPosixTestPath = (value: string): string =>
  process.platform === 'win32' ? String(value) : String(value).replace(/\\/g, '/');

describe('RelayHostEngine (local health control)', () => {
  // systemd --user runtime dirs derive from the caller's uid. Windows hosts have no process.getuid,
  // so give the linux-simulating tests a fixed uid instead of an empty /run/user/ expectation.
  let installedGetuidStub = false;
  beforeEach(() => {
    if (typeof process.getuid !== 'function') {
      Object.defineProperty(process, 'getuid', { value: () => 1000, configurable: true, writable: true });
      installedGetuidStub = true;
    }
  });
  afterEach(() => {
    if (installedGetuidStub) {
      delete (process as { getuid?: unknown }).getuid;
      installedGetuidStub = false;
    }
  });

  it('treats localized Windows scheduled-task status as active when the task is running', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;

    Object.defineProperty(process, 'platform', { value: 'win32' });

    try {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => 'C:\\Users\\tester',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: (cmd: string, args?: readonly string[]) => {
            if (cmd === 'powershell.exe') {
              const commandText = Array.isArray(args) ? String(args.at(-1) ?? '') : '';
              const usesTaskState = commandText.includes('$task.State') && commandText.includes('[int]$task.State');
              return {
                status: 0,
                stdout: usesTaskState
                  ? '{"exists":true,"enabled":true,"active":true,"stateLabel":"Running","stateValue":4}'
                  : '{"exists":true,"enabled":true,"active":false,"stateLabel":"","stateValue":null}',
                stderr: '',
              };
            }
            if (cmd === 'schtasks') {
              return {
                status: 0,
                stdout: 'Statut: En cours\r\nStatut de la tâche planifiée: Activée\r\n',
                stderr: '',
              };
            }
            return { status: 0, stdout: '', stderr: '' };
          },
        };
      });

      vi.doMock('node:fs', async () => {
        const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
        return {
          ...actual,
          existsSync: (path: string) => path.includes('self-host-state.json') || path.endsWith('\\bin\\happier-server.exe') || path.endsWith('\\server.env'),
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => {
            if (path.endsWith('self-host-state.json')) {
              return '{"version":"happier-server-v0.2.4-windows-x64"}\n';
            }
            if (path.endsWith('server.env')) {
              return 'PORT=3005\r\nHAPPIER_SERVER_HOST=127.0.0.1\r\n';
            }
            return '';
          },
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '%USERPROFILE%\\.happier\\self-host\\current\\happier-server.exe', versionId: 'publicdev-1' }),
      });

      const status = await engine.readStatus({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'preview',
      });

      expect(status.service).toEqual({ enabled: true, active: true });
      expect(status.healthy).toBe(true);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('reports the local relay as unhealthy when the service is active but the health probe fails', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;
    const expectedRuntimeDir = `/run/user/${typeof process.getuid === 'function' ? process.getuid() : ''}`;

    Object.defineProperty(process, 'platform', { value: 'linux' });

    try {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: (cmd: string, args?: readonly string[], options?: { env?: NodeJS.ProcessEnv }) => {
            if (cmd === 'systemctl' && Array.isArray(args) && args.includes('show')) {
              expect(options?.env?.XDG_RUNTIME_DIR).toBe(expectedRuntimeDir);
              expect(options?.env?.DBUS_SESSION_BUS_ADDRESS).toBe(`unix:path=${expectedRuntimeDir}/bus`);
              return {
                status: 0,
                stdout: 'ActiveState=active\nSubState=running\nUnitFileState=enabled\nLoadState=loaded\n',
                stderr: '',
              };
            }
            return { status: 0, stdout: '', stderr: '' };
          },
        };
      });

      vi.doMock('node:fs', async () => {
        const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
        return {
          ...actual,
          existsSync: (hostPath: string, path = toPosixTestPath(hostPath)) =>
            path.includes('self-host-state.json') || path.endsWith('/bin/happier-server') || path.endsWith('/server.env'),
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => {
            if (path.endsWith('self-host-state.json')) {
              return '{"version":"0.1.2"}\n';
            }
            if (path.endsWith('server.env')) {
              return 'PORT=24851\nHAPPIER_SERVER_HOST=127.0.0.1\n';
            }
            return '';
          },
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      const status = await engine.readStatus({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
      });

      expect(status.service).toEqual({ enabled: true, active: true });
      expect(status.healthy).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('waits for the local relay health probe after starting the service', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;
    const commands: string[] = [];
    const systemctlRuntimeDirs: string[] = [];
    const defaults = resolveRelayRuntimeDefaults({
      platform: 'linux',
      mode: 'user',
      channel: 'publicdev',
      homeDir: '/tmp/happy-home',
    });

    Object.defineProperty(process, 'platform', { value: 'linux' });

    try {
      const fetchCalls: string[] = [];
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        fetchCalls.push(String(url));
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '0.1.2' }),
        } as Response;
      }) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: (cmd: string, args?: readonly string[], options?: { env?: NodeJS.ProcessEnv }) => {
            commands.push([cmd, ...(Array.isArray(args) ? args : [])].join(' '));
            if (cmd === 'systemctl' && Array.isArray(args) && args.includes('--user')) {
              systemctlRuntimeDirs.push(String(options?.env?.XDG_RUNTIME_DIR ?? ''));
              expect(options?.env?.DBUS_SESSION_BUS_ADDRESS).toBe(`unix:path=${options?.env?.XDG_RUNTIME_DIR}/bus`);
            }
            return { status: 0, stdout: '', stderr: '' };
          },
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      // Declare the configured server.env explicitly instead of relying on the node:fs mock leaked
      // from the previous test.
      vi.doMock('node:fs', async () => {
        const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
        return {
          ...actual,
          existsSync: (hostPath: string, path = toPosixTestPath(hostPath)) =>
            path.includes('self-host-state.json') || path.endsWith('/bin/happier-server') || path.endsWith('/server.env'),
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => path.endsWith('server.env')
            ? 'PORT=24851\nHAPPIER_SERVER_HOST=127.0.0.1\n'
            : '',
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      await expect(engine.control({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
        action: 'start',
      })).resolves.toBeUndefined();

      expect(commands.some((command) => command.includes(`systemctl --user start ${defaults.serviceName}.service`))).toBe(true);
      expect(systemctlRuntimeDirs).toContain(`/run/user/${typeof process.getuid === 'function' ? process.getuid() : ''}`);
      expect(fetchCalls).toContain('http://127.0.0.1:24851/v1/version');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('retries the local relay health probe during start until the relay becomes healthy', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;
    const originalTimeoutEnv = process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;
    const commands: string[] = [];

    Object.defineProperty(process, 'platform', { value: 'linux' });

    vi.useFakeTimers();
    try {
      process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS = '5000';

      let fetchAttempt = 0;
      globalThis.fetch = vi.fn(async () => {
        fetchAttempt += 1;
        const ok = fetchAttempt >= 11;
        return {
          ok,
          status: ok ? 200 : 503,
          json: async () => (ok ? ({ version: '0.1.2' }) : ({})),
        } as Response;
      }) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: (cmd: string, args?: readonly string[]) => {
            commands.push([cmd, ...(Array.isArray(args) ? args : [])].join(' '));
            return { status: 0, stdout: '', stderr: '' };
          },
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => path.endsWith('server.env')
            ? 'PORT=24851\nHAPPIER_SERVER_HOST=127.0.0.1\n'
            : '',
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      const controlPromise = engine.control({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
        action: 'start',
      });

      await vi.advanceTimersByTimeAsync(3_000);
      await expect(controlPromise).resolves.toBeUndefined();

      expect(fetchAttempt).toBeGreaterThanOrEqual(11);
      expect(commands.some((command) => command.includes('systemctl'))).toBe(true);
    } finally {
      if (originalTimeoutEnv === undefined) {
        delete process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;
      } else {
        process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS = originalTimeoutEnv;
      }
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('uses the long default local relay health timeout during restart', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;
    const originalTimeoutEnv = process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;
    const commands: string[] = [];

    Object.defineProperty(process, 'platform', { value: 'linux' });

    vi.useFakeTimers();
    try {
      delete process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;

      const healthStartMs = Date.now();
      globalThis.fetch = vi.fn(async () => {
        const ok = Date.now() - healthStartMs >= 6_000;
        return {
          ok,
          status: ok ? 200 : 503,
          json: async () => (ok ? ({ version: '0.1.2' }) : ({})),
        } as Response;
      }) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: (cmd: string, args?: readonly string[]) => {
            commands.push([cmd, ...(Array.isArray(args) ? args : [])].join(' '));
            return { status: 0, stdout: '', stderr: '' };
          },
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => path.endsWith('server.env')
            ? 'PORT=24851\nHAPPIER_SERVER_HOST=127.0.0.1\n'
            : '',
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      const controlPromise = engine.control({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
        action: 'restart',
      });

      await vi.advanceTimersByTimeAsync(7_000);
      await expect(controlPromise).resolves.toBeUndefined();

      expect(commands.some((command) => command.includes('systemctl --user restart'))).toBe(true);
    } finally {
      if (originalTimeoutEnv === undefined) {
        delete process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;
      } else {
        process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS = originalTimeoutEnv;
      }
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('rejects local restart when the relay never becomes healthy again', async () => {
    const originalPlatform = process.platform;
    const originalFetch = globalThis.fetch;
    const originalTimeoutEnv = process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;

    Object.defineProperty(process, 'platform', { value: 'linux' });

    try {
      process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS = '250';
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
        };
      });

      vi.doMock('node:net', async () => {
        const actual = await vi.importActual<typeof import('node:net')>('node:net');
        return {
          ...actual,
          createConnection: () => {
            const socket = new EventEmitter() as EventEmitter & {
              setTimeout: (timeoutMs: number) => void;
              destroy: () => void;
            };
            socket.setTimeout = (_timeoutMs: number) => undefined;
            socket.destroy = () => undefined;
            process.nextTick(() => socket.emit('connect'));
            return socket;
          },
        };
      });

      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        return {
          ...actual,
          readFile: async (path: string) => path.endsWith('server.env')
            ? 'PORT=24851\nHAPPIER_SERVER_HOST=127.0.0.1\n'
            : '',
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      await expect(engine.control({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
        action: 'restart',
      })).rejects.toThrow(/healthy/i);
    } finally {
      if (originalTimeoutEnv === undefined) {
        delete process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS;
      } else {
        process.env.HAPPIER_RELAY_HOST_LOCAL_HEALTHCHECK_TIMEOUT_MS = originalTimeoutEnv;
      }
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      globalThis.fetch = originalFetch;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it('translates local systemd user bus failures into an actionable error', async () => {
    const originalPlatform = process.platform;

    Object.defineProperty(process, 'platform', { value: 'linux' });

    try {
      vi.doMock('node:os', async () => {
        const actual = await vi.importActual<typeof import('node:os')>('node:os');
        return {
          ...actual,
          homedir: () => '/tmp/happy-home',
        };
      });

      vi.doMock('node:child_process', async () => {
        const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
        return {
          ...actual,
          spawnSync: () => ({
            status: 1,
            stdout: '',
            stderr: 'Failed to connect to bus: Connection refused',
          }),
        };
      });

      const { createRelayHostEngine } = await import('./relayHostEngine.js');

      const engine = createRelayHostEngine({
        resolveRemoteReleaseTarget: async () => ({ os: 'linux', arch: 'x64' }),
        runRemoteText: async () => ({ status: 0, stdout: '', stderr: '' }),
        copyLocalDirectoryToRemote: async () => {},
        installRemoteComponent: async () => ({ binaryPath: '$HOME/.happier/happier-server/current/happier-server', versionId: 'publicdev-1' }),
      });

      await expect(engine.control({
        target: { kind: 'local' },
        mode: 'user',
        channel: 'dev',
        action: 'start',
      })).rejects.toThrow(
        'Systemd user service is unavailable. Ensure the host has a user systemd session (e.g. enable lingering) or use system mode.',
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      vi.resetModules();
      vi.clearAllMocks();
    }
  });
});
