import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import {
  clearProcessInstanceFingerprintCache,
  processInstanceFingerprintMatches,
  readProcessInstanceFingerprint,
  readProcessInstanceFingerprintSync,
} from './processInstance.mjs';

test('readProcessInstanceFingerprintSync reads the Linux proc start-time field', () => {
  const stat = `123 (node worker) S ${Array.from({ length: 18 }, (_, index) => index + 1).join(' ')} 987654 0 0`;
  assert.equal(
    readProcessInstanceFingerprintSync(123, {
      platform: 'linux',
      readFileSyncImpl: () => stat,
      spawnSyncImpl: () => {
        throw new Error('portable fallback must not run');
      },
    }),
    'linux-proc:987654',
  );
});

test('readProcessInstanceFingerprintSync reads a Windows CIM creation timestamp', () => {
  const calls = [];
  const fingerprint = readProcessInstanceFingerprintSync(456, {
    platform: 'win32',
    spawnSyncImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: '2026-07-23T12:34:56.0000000Z\r\n' };
    },
  });

  assert.equal(fingerprint, 'win32-cim:2026-07-23T12:34:56.0000000Z');
  assert.equal(calls[0].command, 'powershell.exe');
  assert.match(calls[0].args.at(-1), /ProcessId=456/);
  assert.equal(calls[0].options.shell, undefined);
});

test('processInstanceFingerprintMatches fails closed when either observation is unavailable', () => {
  assert.equal(processInstanceFingerprintMatches('linux-proc:1', 'linux-proc:1'), true);
  assert.equal(processInstanceFingerprintMatches('linux-proc:1', null), false);
  assert.equal(processInstanceFingerprintMatches(null, 'linux-proc:1'), false);
});

function createFakeChild({ stdoutContent = '', exitCode = 0, delayMs = 10 } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.kill = () => {
    child.killed = true;
    child.emit('close', 1);
  };
  child.killed = false;

  setTimeout(() => {
    if (!child.killed) {
      if (stdoutContent) {
        child.stdout.emit('data', stdoutContent);
      }
      child.emit('close', exitCode);
    }
  }, delayMs);

  return child;
}

test('readProcessInstanceFingerprint returns fingerprint asynchronously on Windows', async () => {
  clearProcessInstanceFingerprintCache();
  const calls = [];
  const fakeSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    return createFakeChild({ stdoutContent: '2026-09-06T12:00:00.0000000Z\r\n' });
  };

  const res = await readProcessInstanceFingerprint(1001, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
  });

  assert.equal(res, 'win32-cim:2026-09-06T12:00:00.0000000Z');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'powershell.exe');
});

test('readProcessInstanceFingerprint returns fingerprint asynchronously on Linux', async () => {
  clearProcessInstanceFingerprintCache();
  const stat = `2002 (node worker) S ${Array.from({ length: 18 }, (_, index) => index + 1).join(' ')} 543210 0 0`;
  const res = await readProcessInstanceFingerprint(2002, {
    platform: 'linux',
    readFileAsyncImpl: async () => stat,
    spawnImpl: () => {
      throw new Error('should not spawn');
    },
  });

  assert.equal(res, 'linux-proc:543210');
});

test('readProcessInstanceFingerprint times out, kills child process, and returns null', async () => {
  clearProcessInstanceFingerprintCache();
  let killed = false;
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.kill = () => {
      killed = true;
      child.emit('close', 1);
    };
    // Never closes by itself
    return child;
  };

  const res = await readProcessInstanceFingerprint(3003, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    timeoutMs: 30,
  });

  assert.equal(res, null);
  assert.equal(killed, true);
});

test('readProcessInstanceFingerprint deduplicates concurrent queries for the same pid', async () => {
  clearProcessInstanceFingerprintCache();
  let spawnCount = 0;
  const fakeSpawn = () => {
    spawnCount++;
    return createFakeChild({ stdoutContent: '2026-09-06T12:00:00.0000000Z\r\n', delayMs: 40 });
  };

  const [res1, res2] = await Promise.all([
    readProcessInstanceFingerprint(4004, { platform: 'win32', spawnImpl: fakeSpawn }),
    readProcessInstanceFingerprint(4004, { platform: 'win32', spawnImpl: fakeSpawn }),
  ]);

  assert.equal(res1, 'win32-cim:2026-09-06T12:00:00.0000000Z');
  assert.equal(res2, 'win32-cim:2026-09-06T12:00:00.0000000Z');
  assert.equal(spawnCount, 1);
});

test('readProcessInstanceFingerprint hits cache within TTL and re-queries after expiration', async () => {
  clearProcessInstanceFingerprintCache();
  let spawnCount = 0;
  const fakeSpawn = () => {
    spawnCount++;
    return createFakeChild({ stdoutContent: `2026-09-06T12:00:0${spawnCount}.0000000Z\r\n`, delayMs: 10 });
  };

  const res1 = await readProcessInstanceFingerprint(5005, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    cacheTtlMs: 50,
  });
  assert.equal(res1, 'win32-cim:2026-09-06T12:00:01.0000000Z');
  assert.equal(spawnCount, 1);

  // Still within TTL
  const res2 = await readProcessInstanceFingerprint(5005, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    cacheTtlMs: 50,
  });
  assert.equal(res2, 'win32-cim:2026-09-06T12:00:01.0000000Z');
  assert.equal(spawnCount, 1);

  // Wait past TTL
  await new Promise((resolve) => setTimeout(resolve, 60));

  const res3 = await readProcessInstanceFingerprint(5005, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    cacheTtlMs: 50,
  });
  assert.equal(res3, 'win32-cim:2026-09-06T12:00:02.0000000Z');
  assert.equal(spawnCount, 2);
});

test('clearProcessInstanceFingerprintCache clears the cached results', async () => {
  clearProcessInstanceFingerprintCache();
  let spawnCount = 0;
  const fakeSpawn = () => {
    spawnCount++;
    return createFakeChild({ stdoutContent: `2026-09-06T12:00:0${spawnCount}.0000000Z\r\n`, delayMs: 10 });
  };

  await readProcessInstanceFingerprint(6006, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    cacheTtlMs: 60000,
  });
  assert.equal(spawnCount, 1);

  clearProcessInstanceFingerprintCache();

  await readProcessInstanceFingerprint(6006, {
    platform: 'win32',
    spawnImpl: fakeSpawn,
    cacheTtlMs: 60000,
  });
  assert.equal(spawnCount, 2);
});
