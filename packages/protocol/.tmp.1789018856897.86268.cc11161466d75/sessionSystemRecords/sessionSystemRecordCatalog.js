import { z } from 'zod';
import { SessionBackgroundTaskRecordV1Schema } from '../activity/backgroundTask/backgroundTaskRecordV1.js';
import { SessionWorkflowRunSnapshotV1Schema } from '../sessionWorkflowActivity/sessionWorkflowRunSnapshotV1.js';
import { SessionSummaryShardV1Schema } from '../structuredMessages/sessionSummaryShardV1.js';
import { SessionSynopsisV1Schema } from '../structuredMessages/sessionSynopsisV1.js';
import { SESSION_SYSTEM_RECORD_ACTIVITY_NAMESPACE } from './activity/activitySystemRecordKinds.js';
import { SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE } from './memory/memorySystemRecordKinds.js';
function defineSessionSystemRecordCatalog(catalog) {
    return catalog;
}
export const SESSION_SYSTEM_RECORD_CATALOG = defineSessionSystemRecordCatalog({
    [SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE]: {
        kinds: {
            'summary_shard.v1': {
                payloadSchema: SessionSummaryShardV1Schema,
            },
            'synopsis.v1': {
                payloadSchema: SessionSynopsisV1Schema,
            },
        },
    },
    [SESSION_SYSTEM_RECORD_ACTIVITY_NAMESPACE]: {
        kinds: {
            'workflow_run.v1': {
                payloadSchema: SessionWorkflowRunSnapshotV1Schema,
            },
            'background_task.v1': {
                payloadSchema: SessionBackgroundTaskRecordV1Schema,
            },
        },
    },
});
export function isRegisteredSessionSystemRecordKind(namespace, kind) {
    return getSessionSystemRecordPayloadSchema(namespace, kind) !== null;
}
export function addRegisteredSessionSystemRecordKindIssue(value, ctx) {
    if (!isRegisteredSessionSystemRecordKind(value.namespace, value.kind)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Unregistered session system record namespace/kind pair',
            path: ['kind'],
        });
    }
}
export function addSessionSystemRecordPlainContentPayloadIssue(value, ctx) {
    addRegisteredSessionSystemRecordKindIssue(value, ctx);
    const content = value.content;
    if (!content || typeof content !== 'object' || Array.isArray(content))
        return;
    const record = content;
    if (record.t !== 'plain')
        return;
    const payloadSchema = getSessionSystemRecordPayloadSchema(value.namespace, value.kind);
    if (!payloadSchema)
        return;
    const parsed = payloadSchema.safeParse(record.v);
    if (parsed.success)
        return;
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Plain session system record content does not match registered namespace/kind payload schema',
        path: ['content', 'v'],
    });
}
export function getSessionSystemRecordPayloadSchema(namespace, kind) {
    const catalog = SESSION_SYSTEM_RECORD_CATALOG;
    return catalog[namespace]?.kinds[kind]?.payloadSchema ?? null;
}
//# sourceMappingURL=sessionSystemRecordCatalog.js.map