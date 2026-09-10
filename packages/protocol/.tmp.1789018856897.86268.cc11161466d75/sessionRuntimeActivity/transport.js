import { z } from 'zod';
import { SessionRuntimeActivityProjectionSchema, SessionRuntimeActivitySnapshotSchema, } from './projection.js';
export const SESSION_RUNTIME_ACTIVITY_SNAPSHOT_EVENT = 'session-runtime-activity-snapshot';
export const SESSION_RUNTIME_ACTIVITY_CLOSE_EVENT = 'session-runtime-activity-close';
export const SESSION_PUBLISHER_LEGACY_ALIVE_EVENT = 'session-alive';
export const SESSION_PUBLISHER_LEGACY_END_EVENT = 'session-end';
/** Released stable/preview CLI reachability vector, retained only at the machine-bound socket seam. */
export const SessionPublisherLegacyAliveSchema = z.object({
    sid: z.string().trim().min(1),
    time: z.number().finite(),
    thinking: z.boolean(),
    mode: z.enum(['local', 'remote']).optional(),
}).passthrough();
/** Released stable/preview CLI clean-end vector, retained only at the machine-bound socket seam. */
export const SessionPublisherLegacyEndSchema = z.object({
    sid: z.string().trim().min(1),
    time: z.number().finite(),
}).passthrough();
const SessionRuntimeActivityTransportIdentitySchema = z.object({
    sessionId: z.string().trim().min(1),
    mutationId: z.string().trim().min(1),
}).strict();
export const SessionRuntimeActivitySnapshotRequestSchema = z.object({
    sessionId: z.string().trim().min(1),
    mutationId: z.string().trim().min(1),
    snapshot: SessionRuntimeActivitySnapshotSchema,
}).strict();
const SessionRuntimeActivitySnapshotAppliedAckSchema = SessionRuntimeActivityTransportIdentitySchema.extend({
    status: z.literal('applied'),
    projection: SessionRuntimeActivityProjectionSchema,
}).strict();
const SessionRuntimeActivitySnapshotUnchangedAckSchema = SessionRuntimeActivityTransportIdentitySchema.extend({
    status: z.literal('unchanged'),
    projection: SessionRuntimeActivityProjectionSchema,
}).strict();
const SessionRuntimeActivitySnapshotRejectedAckSchema = SessionRuntimeActivityTransportIdentitySchema.extend({
    status: z.literal('rejected'),
    reason: z.enum([
        'not_found',
        'unauthorized',
        'archived',
        'superseded',
        'revision_overflow',
    ]),
}).strict();
const SessionRuntimeActivitySnapshotInvalidRequestAckSchema = z.object({
    status: z.literal('rejected'),
    reason: z.literal('invalid_request'),
}).strict();
const SessionRuntimeActivitySnapshotRetryableAckSchema = SessionRuntimeActivityTransportIdentitySchema.extend({
    status: z.literal('retryable'),
    reason: z.literal('internal'),
}).strict();
export const SessionRuntimeActivitySnapshotAckSchema = z.union([
    SessionRuntimeActivitySnapshotAppliedAckSchema,
    SessionRuntimeActivitySnapshotUnchangedAckSchema,
    SessionRuntimeActivitySnapshotRejectedAckSchema,
    SessionRuntimeActivitySnapshotInvalidRequestAckSchema,
    SessionRuntimeActivitySnapshotRetryableAckSchema,
]);
export const SessionRuntimeActivityCloseRequestSchema = z.object({
    sessionId: z.string().trim().min(1),
}).strict();
export const SessionRuntimeActivityCloseAckSchema = z.union([
    z.object({ status: z.literal('closed'), sessionId: z.string().trim().min(1) }).strict(),
    z.object({ status: z.literal('already_inactive'), sessionId: z.string().trim().min(1) }).strict(),
    z.object({
        status: z.literal('rejected'),
        sessionId: z.string().trim().min(1),
        reason: z.enum(['not_found', 'unauthorized', 'archived', 'superseded']),
    }).strict(),
    z.object({
        status: z.literal('retryable'),
        sessionId: z.string().trim().min(1),
        reason: z.literal('internal'),
    }).strict(),
    z.object({ status: z.literal('rejected'), reason: z.literal('invalid_request') }).strict(),
]);
//# sourceMappingURL=transport.js.map