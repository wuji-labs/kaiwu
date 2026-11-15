import { describe, expect, it } from 'vitest';

import { createFingerprintThrottle } from './fingerprintThrottle';

describe('createFingerprintThrottle', () => {
  it('reuses the previous result when the state fingerprint is unchanged', async () => {
    let now = 0;
    let fingerprint = 'clean';
    let fingerprintReads = 0;
    let scans = 0;
    const throttle = createFingerprintThrottle({ minIntervalMs: 100, now: () => now });

    const scan = async (): Promise<string> => {
      scans += 1;
      return `result-${scans}`;
    };
    const readFingerprint = async (): Promise<string> => {
      fingerprintReads += 1;
      return fingerprint;
    };

    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-1');
    now = 99;
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-1');
    expect(fingerprintReads).toBe(1);
    expect(scans).toBe(1);

    fingerprint = 'dirty';
    now = 200;
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-2');
    expect(fingerprintReads).toBe(2);
    expect(scans).toBe(2);
  });

  it('does not probe the fingerprint again during the minimum interval', async () => {
    let now = 0;
    let fingerprintReads = 0;
    let scans = 0;
    const throttle = createFingerprintThrottle({ minIntervalMs: 1_000, now: () => now });

    const readFingerprint = async (): Promise<string> => {
      fingerprintReads += 1;
      return 'same';
    };
    const scan = async (): Promise<number> => {
      scans += 1;
      return scans;
    };

    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe(1);
    now = 999;
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe(1);
    expect(fingerprintReads).toBe(1);
    expect(scans).toBe(1);
  });

  it('coalesces concurrent probes and scans for one key', async () => {
    let resolveFingerprint: ((value: string) => void) | undefined;
    let resolveScan: ((value: string) => void) | undefined;
    let fingerprintReads = 0;
    let scans = 0;
    const throttle = createFingerprintThrottle({ minIntervalMs: 0 });

    const readFingerprint = (): Promise<string> => {
      fingerprintReads += 1;
      return new Promise((resolve) => {
        resolveFingerprint = resolve;
      });
    };
    const scan = (): Promise<string> => {
      scans += 1;
      return new Promise((resolve) => {
        resolveScan = resolve;
      });
    };

    const first = throttle.run('repo', readFingerprint, scan);
    const second = throttle.run('repo', readFingerprint, scan);
    expect(fingerprintReads).toBe(1);
    resolveFingerprint?.('state-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(scans).toBe(1);
    resolveScan?.('result');
    await expect(Promise.all([first, second])).resolves.toEqual(['result', 'result']);
  });

  it('rescans when the fingerprint cannot be read instead of assuming it is unchanged', async () => {
    let fingerprint: string | null = 'state-1';
    let scans = 0;
    const throttle = createFingerprintThrottle({ minIntervalMs: 0 });

    const scan = async (): Promise<string> => {
      scans += 1;
      return `result-${scans}`;
    };
    const readFingerprint = async (): Promise<string | null> => fingerprint;

    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-1');

    fingerprint = null;
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-2');
    expect(scans).toBe(2);

    // A null probe is never treated as a reusable key: the scan result is kept
    // but the next readable fingerprint forces a fresh comparison scan.
    fingerprint = 'state-2';
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe('result-3');
    expect(scans).toBe(3);
  });

  it('invalidate drops cached results so the next run scans again', async () => {
    let scans = 0;
    const throttle = createFingerprintThrottle({ minIntervalMs: 60_000, now: () => 0 });
    const scan = async (): Promise<number> => {
      scans += 1;
      return scans;
    };
    const readFingerprint = async (): Promise<string> => 'same';

    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe(1);
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe(1);
    expect(scans).toBe(1);

    throttle.invalidate('repo');
    await expect(throttle.run('repo', readFingerprint, scan)).resolves.toBe(2);
    expect(scans).toBe(2);
  });
});
