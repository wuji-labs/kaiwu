import { describe, expect, it } from 'vitest';

import {
  ClientEncryptionRequirementSchema,
  combineClientEncryptionRequirements,
  isAccountEncryptionModeAllowedByClientRequirement,
  isSessionEncryptionModeAllowedByClientRequirement,
} from './clientEncryptionRequirement.js';

describe('client encryption requirement', () => {
  it('defaults missing persisted values to following the Account mode', () => {
    expect(ClientEncryptionRequirementSchema.parse(undefined)).toBe('follow_account');
  });

  it('combines independently supplied requirements without allowing a weaker input to win', () => {
    expect(combineClientEncryptionRequirements('follow_account', 'follow_account')).toBe('follow_account');
    expect(combineClientEncryptionRequirements('follow_account', 'require_e2ee')).toBe('require_e2ee');
    expect(combineClientEncryptionRequirements('require_e2ee', 'follow_account')).toBe('require_e2ee');
  });

  it('rejects plain Account and Session content only when E2EE is required', () => {
    expect(isAccountEncryptionModeAllowedByClientRequirement('follow_account', 'plain')).toBe(true);
    expect(isSessionEncryptionModeAllowedByClientRequirement('follow_account', 'plain')).toBe(true);
    expect(isAccountEncryptionModeAllowedByClientRequirement('require_e2ee', 'plain')).toBe(false);
    expect(isSessionEncryptionModeAllowedByClientRequirement('require_e2ee', 'plain')).toBe(false);
    expect(isAccountEncryptionModeAllowedByClientRequirement('require_e2ee', 'e2ee')).toBe(true);
    expect(isSessionEncryptionModeAllowedByClientRequirement('require_e2ee', 'e2ee')).toBe(true);
  });
});
