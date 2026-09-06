/**
 * Note: For daemon hot paths, please use the async `readProcessInstanceFingerprint`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, promises as fsPromises } from 'node:fs';

function normalizePid(pid) {
  const value = Number(pid);
  return Number.isInteger(value) && value > 1 ? value : null;
}

function runProbe(command, args, { spawnSyncImpl }) {
  const result = spawnSyncImpl(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result?.error || result?.status !== 0) return null;
  const value = String(result?.stdout ?? '').trim();
  return value || null;
}

const fingerprintCache = new Map();

export function clearProcessInstanceFingerprintCache() {
  fingerprintCache.clear();
}

function runProbeAsync(command, args, { spawnImpl = spawn, timeoutMs = 15000 }) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let child = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const finish = (val) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };

    try {
      child = spawnImpl(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return finish(null);
    }

    if (!child) {
      return finish(null);
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore kill errors
        }
        finish(null);
      }, timeoutMs);
      if (typeof timer?.unref === 'function') {
        timer.unref();
      }
    }

    let stdout = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    }

    child.on('error', () => {
      finish(null);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        finish(null);
      } else {
        const val = stdout.trim();
        finish(val || null);
      }
    });
  });
}

async function computeProcessInstanceFingerprint(normalizedPid, {
  platform = process.platform,
  spawnImpl = spawn,
  readFileAsyncImpl = fsPromises.readFile,
  timeoutMs = 15000,
} = {}) {
  if (platform === 'linux') {
    try {
      const stat = String(await readFileAsyncImpl(`/proc/${normalizedPid}/stat`, 'utf8'));
      const closingParen = stat.lastIndexOf(')');
      const fieldsAfterCommand = closingParen >= 0
        ? stat.slice(closingParen + 1).trim().split(/\s+/)
        : [];
      const startTimeTicks = fieldsAfterCommand[19];
      if (/^\d+$/.test(String(startTimeTicks ?? ''))) {
        return `linux-proc:${startTimeTicks}`;
      }
    } catch {
      // Fall through to portable POSIX probe
    }
  }

  if (platform === 'win32') {
    const script = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${normalizedPid}" -ErrorAction Stop`,
      'if ($null -eq $p) { exit 3 }',
      '$p.CreationDate.ToUniversalTime().ToString("O")',
    ].join('; ');
    const value = await runProbeAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], { spawnImpl, timeoutMs });
    return value ? `win32-cim:${value}` : null;
  }

  const value = await runProbeAsync('ps', ['-o', 'lstart=', '-p', String(normalizedPid)], { spawnImpl, timeoutMs });
  return value ? `${platform}-ps:${value}` : null;
}

export function readProcessInstanceFingerprint(pid, options = {}) {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) return Promise.resolve(null);

  const { cacheTtlMs = 60000 } = options;
  const now = Date.now();

  const cached = fingerprintCache.get(normalizedPid);
  if (cached) {
    if (cached.promise) {
      return cached.promise;
    }
    if (cached.expiresAt > now && cached.fingerprint) {
      return Promise.resolve(cached.fingerprint);
    }
    fingerprintCache.delete(normalizedPid);
  }

  const promise = (async () => {
    try {
      const result = await computeProcessInstanceFingerprint(normalizedPid, options);
      if (result) {
        fingerprintCache.set(normalizedPid, {
          fingerprint: result,
          expiresAt: Date.now() + cacheTtlMs,
          promise: null,
        });
      } else {
        fingerprintCache.delete(normalizedPid);
      }
      return result;
    } catch {
      fingerprintCache.delete(normalizedPid);
      return null;
    }
  })();

  fingerprintCache.set(normalizedPid, {
    fingerprint: null,
    expiresAt: 0,
    promise,
  });

  return promise;
}

export function readProcessInstanceFingerprintSync(pid, {
  platform = process.platform,
  spawnSyncImpl = spawnSync,
  readFileSyncImpl = readFileSync,
} = {}) {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) return null;

  if (platform === 'linux') {
    try {
      const stat = String(readFileSyncImpl(`/proc/${normalizedPid}/stat`, 'utf8'));
      const closingParen = stat.lastIndexOf(')');
      const fieldsAfterCommand = closingParen >= 0
        ? stat.slice(closingParen + 1).trim().split(/\s+/)
        : [];
      const startTimeTicks = fieldsAfterCommand[19];
      if (/^\d+$/.test(String(startTimeTicks ?? ''))) {
        return `linux-proc:${startTimeTicks}`;
      }
    } catch {
      // Fall through to the portable POSIX probe.
    }
  }

  if (platform === 'win32') {
    const script = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${normalizedPid}" -ErrorAction Stop`,
      'if ($null -eq $p) { exit 3 }',
      '$p.CreationDate.ToUniversalTime().ToString("O")',
    ].join('; ');
    const value = runProbe('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], { spawnSyncImpl });
    return value ? `win32-cim:${value}` : null;
  }

  const value = runProbe('ps', ['-o', 'lstart=', '-p', String(normalizedPid)], { spawnSyncImpl });
  return value ? `${platform}-ps:${value}` : null;
}

export function processInstanceFingerprintMatches(expected, observed) {
  const normalizedExpected = String(expected ?? '').trim();
  const normalizedObserved = String(observed ?? '').trim();
  return Boolean(normalizedExpected && normalizedObserved && normalizedExpected === normalizedObserved);
}
