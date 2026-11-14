import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildServiceCommandEnv } from './manager';

describe('buildServiceCommandEnv', () => {
  const originalSudoUid = process.env.SUDO_UID;
  let installedGetuidStub = false;

  afterEach(() => {
    if (installedGetuidStub) {
      delete (process as { getuid?: unknown }).getuid;
      installedGetuidStub = false;
    }
    if (originalSudoUid == null) {
      delete process.env.SUDO_UID;
    } else {
      process.env.SUDO_UID = originalSudoUid;
    }
    vi.restoreAllMocks();
  });

  it('targets the invoking user XDG_RUNTIME_DIR when root runs systemctl --user under sudo', () => {
    process.env.SUDO_UID = '501';
    // process.getuid does not exist on Windows hosts; install a configurable stub so the same
    // root-under-sudo code path is exercised everywhere (removed again in afterEach).
    if (typeof process.getuid !== 'function') {
      Object.defineProperty(process, 'getuid', { value: () => 1000, configurable: true, writable: true });
      installedGetuidStub = true;
    }
    vi.spyOn(process as NodeJS.Process & { getuid: () => number }, 'getuid').mockReturnValue(0);

    const env = buildServiceCommandEnv({
      cmd: 'systemctl',
      args: ['--user', 'status', 'happier-daemon.default.service'],
      env: {},
    });

    expect(env.XDG_RUNTIME_DIR).toBe('/run/user/501');
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/run/user/501/bus');
  });
});
