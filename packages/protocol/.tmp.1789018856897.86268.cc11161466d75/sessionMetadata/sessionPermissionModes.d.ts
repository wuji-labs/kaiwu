import { z } from 'zod';
export declare const SESSION_PERMISSION_MODES: readonly ["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"];
export type SessionPermissionMode = (typeof SESSION_PERMISSION_MODES)[number];
/**
 * Parse a user-provided permission mode token into a canonical session permission mode.
 *
 * This is intentionally stricter than the compatibility reader below: unknown user input
 * must be rejected rather than silently acquiring the `default` permission mode.
 */
export declare function parseSessionPermissionModeAlias(raw: string): SessionPermissionMode | null;
/** Strict, alias-aware schema for user/action input boundaries. */
export declare function createSessionPermissionModeInputSchema(zod: typeof z): any;
export declare const SessionPermissionModeInputSchema: any;
/**
 * Parse behavior:
 * - Known values parse as-is.
 * - Unknown/invalid values parse as `'default'` (forward compatible; never throws).
 */
export declare function createSessionPermissionModeSchema(zod: typeof z): any;
export declare const SessionPermissionModeSchema: any;
//# sourceMappingURL=sessionPermissionModes.d.ts.map