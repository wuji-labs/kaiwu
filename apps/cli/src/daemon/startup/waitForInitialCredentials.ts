export async function waitForInitialCredentials<TDaemonLockHandle>(opts: {
  isInteractive: boolean;
  waitForAuthEnabled: boolean;
  waitForAuthTimeoutMs: number;
  credentialsPath: string;
  refresh?: () => void;
  readCredentials: () => Promise<unknown | null>;
  acquireDaemonLock: () => Promise<TDaemonLockHandle | null>;
  releaseDaemonLock: (handle: TDaemonLockHandle) => Promise<void>;
  resolvesWhenShutdownRequested: Promise<unknown>;
  logger: { debug: (message: string, details?: unknown) => void };
  daemonLockHandle: TDaemonLockHandle | null;
  sleepMs?: number;
}): Promise<
  | { action: 'continue'; daemonLockHandle: TDaemonLockHandle | null }
  | { action: 'exit'; exitCode: 0 | 1; daemonLockHandle: TDaemonLockHandle | null }
  | { action: 'shutdown'; daemonLockHandle: null }
> {
  if (opts.isInteractive) {
    return { action: 'continue', daemonLockHandle: opts.daemonLockHandle };
  }

  opts.refresh?.();
  const credentials = await opts.readCredentials();
  if (credentials) {
    return { action: 'continue', daemonLockHandle: opts.daemonLockHandle };
  }

  if (!opts.waitForAuthEnabled) {
    opts.logger.debug('[AUTH] No credentials found');
    opts.logger.debug('[守护进程运行] 非交互模式：不启动认证界面。请运行：kaiwu auth login');
    return { action: 'exit', exitCode: 1, daemonLockHandle: opts.daemonLockHandle };
  }

  let daemonLockHandle = opts.daemonLockHandle;
  if (!daemonLockHandle) {
    daemonLockHandle = await opts.acquireDaemonLock();
  }
  if (!daemonLockHandle) {
    opts.logger.debug('[DAEMON RUN] Daemon lock file already held, another daemon is running');
    return { action: 'exit', exitCode: 0, daemonLockHandle: null };
  }

  opts.logger.debug(`[DAEMON RUN] Waiting for credentials at ${opts.credentialsPath}...`);

  const sleepMs = typeof opts.sleepMs === 'number' ? opts.sleepMs : 250;
  let shutdownRequested = false;
  opts.resolvesWhenShutdownRequested.then(() => {
    shutdownRequested = true;
  });

  const startWait = Date.now();
  while (true) {
    if (shutdownRequested) {
      opts.logger.debug('[DAEMON RUN] Shutdown requested while waiting for credentials');
      try {
        await opts.releaseDaemonLock(daemonLockHandle);
      } catch {
        // ignore
      }
      return { action: 'shutdown', daemonLockHandle: null };
    }

    opts.refresh?.();
    const credsNow = await opts.readCredentials();
    if (credsNow) {
      opts.logger.debug('[DAEMON RUN] Credentials detected, continuing daemon startup');
      return { action: 'continue', daemonLockHandle };
    }

    if (opts.waitForAuthTimeoutMs > 0 && Date.now() - startWait > opts.waitForAuthTimeoutMs) {
      opts.logger.debug('[DAEMON RUN] Timed out waiting for credentials');
      throw new Error('等待凭据超时');
    }

    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}
