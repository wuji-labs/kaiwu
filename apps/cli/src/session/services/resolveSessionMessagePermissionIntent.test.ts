import { describe, expect, it } from 'vitest';

import { resolveSessionMessagePermissionIntent } from './resolveSessionMessagePermissionIntent';

describe('resolveSessionMessagePermissionIntent', () => {
  it('preserves an implicit target mode when it is within the caller permission ceiling', () => {
    expect(resolveSessionMessagePermissionIntent({
      decryptedMetadata: { permissionMode: 'default', permissionModeUpdatedAt: 10 },
      permissionModeCeiling: 'safe-yolo',
    })).toEqual({ ok: true, permissionIntent: 'default' });
  });

  it('rejects an implicit target mode above the caller permission ceiling', () => {
    expect(resolveSessionMessagePermissionIntent({
      decryptedMetadata: { permissionMode: 'safe-yolo', permissionModeUpdatedAt: 10 },
      permissionModeCeiling: 'default',
    })).toEqual({ ok: false, code: 'permission_escalation_denied' });
  });

  it('keeps explicit non-escalating overrides authoritative over target metadata', () => {
    expect(resolveSessionMessagePermissionIntent({
      decryptedMetadata: { permissionMode: 'safe-yolo', permissionModeUpdatedAt: 10 },
      permissionModeOverride: 'read_only',
      permissionModeCeiling: 'default',
    })).toEqual({ ok: true, permissionIntent: 'read-only' });
  });
});
