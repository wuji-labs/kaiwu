import { z } from 'zod';
/**
 * One-shot request/response tasks executed by the daemon (not transcript-materialized by default).
 *
 * V1 scope:
 * - SCM commit message generator
 *
 * These schemas are used by session-scoped RPC `ephemeral.task.run` and MCP equivalents.
 */
export declare const EphemeralTaskKindSchema: any;
export type EphemeralTaskKind = z.infer<typeof EphemeralTaskKindSchema>;
export declare const EphemeralTaskPermissionModeSchema: any;
export type EphemeralTaskPermissionMode = z.infer<typeof EphemeralTaskPermissionModeSchema>;
export declare const EphemeralTaskRunRequestSchema: any;
export type EphemeralTaskRunRequest = z.infer<typeof EphemeralTaskRunRequestSchema>;
export declare const EphemeralTaskRunResponseSchema: any;
export type EphemeralTaskRunResponse = z.infer<typeof EphemeralTaskRunResponseSchema>;
//# sourceMappingURL=ephemeralTasks.d.ts.map