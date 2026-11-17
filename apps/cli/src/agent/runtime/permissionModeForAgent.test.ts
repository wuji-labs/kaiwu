import { describe, expect, it } from 'vitest';

import { normalizePermissionModeForAgent } from '@happier-dev/agents';

describe('normalizePermissionModeForAgent', () => {
  it('keeps safe-yolo as the Claude session intent', () => {
    expect(normalizePermissionModeForAgent({ agentId: 'claude', mode: 'safe-yolo' })).toBe('safe-yolo');
  });

  it('keeps yolo as the Claude session intent', () => {
    expect(normalizePermissionModeForAgent({ agentId: 'claude', mode: 'yolo' })).toBe('yolo');
  });

});
