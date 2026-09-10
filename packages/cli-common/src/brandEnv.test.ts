import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { normalizeBrandEnv, getBrandEnv } from './brandEnv';

describe('normalizeBrandEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KAIWU_TEST_VAR;
    delete process.env.HAPPIER_TEST_VAR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers KAIWU_* when only KAIWU_* is set', () => {
    process.env.KAIWU_TEST_VAR = 'kaiwu-value';
    expect(normalizeBrandEnv('KAIWU_TEST_VAR')).toBe('kaiwu-value');
    expect(normalizeBrandEnv('HAPPIER_TEST_VAR')).toBe('kaiwu-value');
  });

  it('falls back to HAPPIER_* with deprecation warning when only HAPPIER_* is set', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.HAPPIER_TEST_VAR = 'happier-value';

    const val1 = normalizeBrandEnv('HAPPIER_TEST_VAR');
    expect(val1).toBe('happier-value');
    expect(errorSpy).toHaveBeenCalled();
    const callsBefore = errorSpy.mock.calls.length;

    // Second call should not warn again (only once per process)
    const val2 = normalizeBrandEnv('HAPPIER_TEST_VAR');
    expect(val2).toBe('happier-value');
    expect(errorSpy.mock.calls.length).toBe(callsBefore);

    errorSpy.mockRestore();
  });

  it('prefers KAIWU_* over HAPPIER_* when both are set without warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.KAIWU_TEST_VAR = 'kaiwu-primary';
    process.env.HAPPIER_TEST_VAR = 'happier-fallback';

    expect(normalizeBrandEnv('KAIWU_TEST_VAR')).toBe('kaiwu-primary');
    expect(normalizeBrandEnv('HAPPIER_TEST_VAR')).toBe('kaiwu-primary');
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('returns undefined when neither is set', () => {
    expect(normalizeBrandEnv('KAIWU_TEST_VAR')).toBeUndefined();
  });

  it('honors default value in getBrandEnv', () => {
    expect(getBrandEnv('KAIWU_TEST_VAR', 'default-val')).toBe('default-val');
  });
});
