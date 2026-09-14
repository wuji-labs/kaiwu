import {
  assertNonEscalatingPermissionMode,
  parsePermissionIntentAlias,
  resolvePermissionIntentFromSessionMetadata,
  type PermissionIntent,
} from '@happier-dev/agents';

export type SessionMessagePermissionIntentResolution =
  | Readonly<{ ok: true; permissionIntent: PermissionIntent }>
  | Readonly<{ ok: false; code: 'permission_escalation_denied' }>;

export function resolveSessionMessagePermissionIntent(params: Readonly<{
  permissionModeOverride?: string;
  permissionModeCeiling?: string;
  decryptedMetadata: unknown;
}>): SessionMessagePermissionIntentResolution {
  let permissionIntent: PermissionIntent;
  if (params.permissionModeOverride) {
    const parsed = parsePermissionIntentAlias(params.permissionModeOverride);
    if (!parsed) {
      const error = new Error(`Invalid permission mode: ${params.permissionModeOverride}`);
      (error as Error & { code?: string }).code = 'invalid_arguments';
      throw error;
    }
    permissionIntent = parsed;
  } else {
    permissionIntent = resolvePermissionIntentFromSessionMetadata(params.decryptedMetadata)?.intent ?? 'default';
  }

  if (!params.permissionModeOverride && params.permissionModeCeiling) {
    const permissionDecision = assertNonEscalatingPermissionMode({
      requestedMode: permissionIntent,
      callerMode: params.permissionModeCeiling,
    });
    if (!permissionDecision.ok) {
      return { ok: false, code: 'permission_escalation_denied' };
    }
  }

  return { ok: true, permissionIntent };
}
