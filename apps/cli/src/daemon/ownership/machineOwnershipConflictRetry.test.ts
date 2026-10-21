import { describe, expect, it } from 'vitest';

import {
  createMachineOwnershipConflictBackoff,
  shouldRetryMachineOwnershipConflict,
} from './machineOwnershipConflictRetry';

describe('shouldRetryMachineOwnershipConflict', () => {
  it('keeps unattended daemons retrying so a restart never leaves the machine offline', () => {
    expect(shouldRetryMachineOwnershipConflict('background-service')).toBe(true);
    expect(shouldRetryMachineOwnershipConflict('self-restart')).toBe(true);
    expect(shouldRetryMachineOwnershipConflict('installer')).toBe(true);
    expect(shouldRetryMachineOwnershipConflict('unknown')).toBe(true);
  });

  it('lets a manually started daemon yield immediately', () => {
    expect(shouldRetryMachineOwnershipConflict('manual')).toBe(false);
  });
});

describe('createMachineOwnershipConflictBackoff', () => {
  it('grows exponentially from 5s, caps at 60s and resets after a connect', () => {
    const backoff = createMachineOwnershipConflictBackoff({ random: () => 0.5 });
    expect([1, 2, 3, 4, 5, 6].map(() => backoff.nextDelayMs())).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
    backoff.reset();
    expect(backoff.nextDelayMs()).toBe(5_000);
  });

  it('applies bounded jitter of at most 20% either way', () => {
    const low = createMachineOwnershipConflictBackoff({ random: () => 0 });
    const high = createMachineOwnershipConflictBackoff({ random: () => 0.999999 });
    expect(low.nextDelayMs()).toBe(4_000);
    expect(high.nextDelayMs()).toBeLessThanOrEqual(6_000);
    expect(high.nextDelayMs()).toBeGreaterThan(11_900);
  });
});
