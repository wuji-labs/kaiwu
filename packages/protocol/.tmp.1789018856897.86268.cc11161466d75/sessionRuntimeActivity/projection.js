import { z } from 'zod';
export const SESSION_RUNTIME_ACTIVITY_ACTIVE_COUNT_MAX = 2_147_483_647;
export const SessionRuntimeActivityStateSchema = z.enum([
    'active',
    'idle',
    'unknown',
]);
export const SessionRuntimeActivityActiveCountSchema = z.number()
    .int()
    .nonnegative()
    .max(SESSION_RUNTIME_ACTIVITY_ACTIVE_COUNT_MAX);
export const SessionRuntimeActivitySnapshotSchema = z.object({
    state: SessionRuntimeActivityStateSchema,
    activeCount: SessionRuntimeActivityActiveCountSchema,
}).strict().superRefine((snapshot, context) => {
    const activeShapeValid = snapshot.activeCount > 0;
    const inactiveShapeValid = snapshot.activeCount === 0;
    if ((snapshot.state === 'active' && !activeShapeValid)
        || (snapshot.state !== 'active' && !inactiveShapeValid)) {
        context.addIssue({
            code: 'custom',
            message: 'Snapshot state and active count disagree',
        });
    }
});
export const SessionRuntimeActivityProjectionSchema = z.object({
    state: SessionRuntimeActivityStateSchema,
    activeCount: SessionRuntimeActivityActiveCountSchema,
    observedAt: z.number().int().nonnegative().safe().nullable(),
    revision: z.number().int().nonnegative().safe(),
}).strict().superRefine((projection, context) => {
    const activeShapeValid = projection.activeCount > 0;
    const inactiveShapeValid = projection.activeCount === 0;
    if ((projection.state === 'active' && !activeShapeValid)
        || (projection.state !== 'active' && !inactiveShapeValid)) {
        context.addIssue({
            code: 'custom',
            message: 'Projection state and active count disagree',
        });
    }
    if (projection.revision === 0) {
        if (projection.state !== 'unknown'
            || projection.activeCount !== 0
            || projection.observedAt !== null) {
            context.addIssue({
                code: 'custom',
                message: 'Revision zero is reserved for the exact unknown baseline',
            });
        }
        return;
    }
    if (projection.observedAt === null && projection.state !== 'unknown') {
        context.addIssue({
            code: 'custom',
            message: 'Only the unknown migration sentinel may omit observedAt at a positive revision',
        });
    }
});
export const SESSION_RUNTIME_ACTIVITY_PROJECTION_FIELD_NAMES = [
    'runtimeActivityState',
    'runtimeActivityActiveCount',
    'runtimeActivityObservedAt',
    'runtimeActivityRevision',
];
export function parseSessionRuntimeActivityProjectionFields(value) {
    if (!value || typeof value !== 'object')
        return { kind: 'absent' };
    const record = value;
    if (Object.prototype.hasOwnProperty.call(record, 'runtimeActivitySourceClass')) {
        return { kind: 'invalid' };
    }
    const presentFields = SESSION_RUNTIME_ACTIVITY_PROJECTION_FIELD_NAMES.filter((field) => (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined));
    if (presentFields.length === 0)
        return { kind: 'absent' };
    if (presentFields.length !== SESSION_RUNTIME_ACTIVITY_PROJECTION_FIELD_NAMES.length) {
        return { kind: 'invalid' };
    }
    const parsed = SessionRuntimeActivityProjectionSchema.safeParse({
        state: record.runtimeActivityState,
        activeCount: record.runtimeActivityActiveCount,
        observedAt: record.runtimeActivityObservedAt,
        revision: record.runtimeActivityRevision,
    });
    return parsed.success
        ? { kind: 'valid', projection: parsed.data }
        : { kind: 'invalid' };
}
export function mergeSessionRuntimeActivityProjection(current, incoming) {
    const parsed = SessionRuntimeActivityProjectionSchema.safeParse(incoming);
    if (!parsed.success) {
        return {
            decision: 'reject_invalid',
            projection: current,
        };
    }
    if (parsed.data.revision > current.revision) {
        return {
            decision: 'replace',
            projection: parsed.data,
        };
    }
    if (parsed.data.revision < current.revision) {
        return {
            decision: 'ignore_stale',
            projection: current,
        };
    }
    if (areSessionRuntimeActivityProjectionsEqual(current, parsed.data)) {
        return {
            decision: 'ignore_identical',
            projection: current,
        };
    }
    return {
        decision: 'resync_conflict',
        projection: current,
    };
}
export function areSessionRuntimeActivityProjectionsEqual(first, second) {
    return first.state === second.state
        && first.activeCount === second.activeCount
        && first.observedAt === second.observedAt
        && first.revision === second.revision;
}
//# sourceMappingURL=projection.js.map