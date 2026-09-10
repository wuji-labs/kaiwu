import { z } from 'zod';
export declare const SESSION_RUNTIME_ACTIVITY_ACTIVE_COUNT_MAX = 2147483647;
export declare const SessionRuntimeActivityStateSchema: any;
export declare const SessionRuntimeActivityActiveCountSchema: any;
export declare const SessionRuntimeActivitySnapshotSchema: any;
export declare const SessionRuntimeActivityProjectionSchema: any;
export type SessionRuntimeActivityState = z.infer<typeof SessionRuntimeActivityStateSchema>;
export type SessionRuntimeActivitySnapshot = z.infer<typeof SessionRuntimeActivitySnapshotSchema>;
export type SessionRuntimeActivityProjection = z.infer<typeof SessionRuntimeActivityProjectionSchema>;
export declare const SESSION_RUNTIME_ACTIVITY_PROJECTION_FIELD_NAMES: readonly ["runtimeActivityState", "runtimeActivityActiveCount", "runtimeActivityObservedAt", "runtimeActivityRevision"];
export type SessionRuntimeActivityProjectionFieldsParseResult = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'valid';
    projection: SessionRuntimeActivityProjection;
}>;
export declare function parseSessionRuntimeActivityProjectionFields(value: unknown): SessionRuntimeActivityProjectionFieldsParseResult;
export type SessionRuntimeActivityProjectionMergeResult = Readonly<{
    decision: 'replace';
    projection: SessionRuntimeActivityProjection;
}> | Readonly<{
    decision: 'ignore_stale' | 'ignore_identical' | 'resync_conflict' | 'reject_invalid';
    projection: SessionRuntimeActivityProjection;
}>;
export declare function mergeSessionRuntimeActivityProjection(current: SessionRuntimeActivityProjection, incoming: unknown): SessionRuntimeActivityProjectionMergeResult;
export declare function areSessionRuntimeActivityProjectionsEqual(first: SessionRuntimeActivityProjection, second: SessionRuntimeActivityProjection): boolean;
//# sourceMappingURL=projection.d.ts.map