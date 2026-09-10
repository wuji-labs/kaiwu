import { z } from 'zod';
import { VoiceAssistantActionSchema } from './voiceActions.js';
import { BackendTargetRefSchema } from './backendTargets/backendTargetRef.js';
import { PendingLocalIdSchema } from './sessionMessages/pendingLocalId.js';
import { ExecutionRunClassSchema, ExecutionRunDisplaySchema, ExecutionRunLaunchOriginSchema, ExecutionRunIntentSchema, ExecutionRunIoModeSchema, ExecutionRunReplaySeedRequestSchema, ExecutionRunResumeHandleSchema, ExecutionRunResumeHandleVendorSessionV1Schema, ExecutionRunResumeHandleVoiceAgentSessionsV1Schema, ExecutionRunRetentionPolicySchema, ExecutionRunStartRequestSchema, ExecutionRunStartResponseSchema, normalizeLegacyExecutionRunBackendTargetInput, } from './executionRunStartRequest.js';
import { ExecutionRunListRequestSchema as ExecutionRunListRequestSchemaBase, ExecutionRunStatusSchema as ExecutionRunStatusSchemaBase, } from './executionRunListRequest.js';
/**
 * Public contract for execution runs (sub-agents / reviews / planning / delegation / voice agent).
 *
 * Notes:
 * - This schema is used by session-scoped RPC + MCP and must remain stable and bounded.
 * - Rich/large UI payloads (e.g. full review findings) are carried via transcript message `meta.happier`.
 */
export { ExecutionRunIntentSchema, ExecutionRunRetentionPolicySchema, ExecutionRunClassSchema, ExecutionRunIoModeSchema, normalizeLegacyExecutionRunBackendTargetInput, ExecutionRunResumeHandleVendorSessionV1Schema, ExecutionRunResumeHandleVoiceAgentSessionsV1Schema, ExecutionRunResumeHandleSchema, ExecutionRunDisplaySchema, ExecutionRunLaunchOriginSchema, ExecutionRunReplaySeedRequestSchema, ExecutionRunStartRequestSchema, ExecutionRunStartResponseSchema, };
// Canonical, stable error code vocabulary for RPC `errorCode` and MCP `error.code`.
// Keep this pinned and deterministic; clients should branch on these strings.
export const ExecutionRunTransportErrorCodeSchema = z.enum([
    'execution_run_not_allowed',
    'execution_run_not_found',
    'execution_run_action_not_supported',
    'execution_run_invalid_action_input',
    'execution_run_stream_not_found',
    'execution_run_busy',
    'execution_run_failed',
    'execution_run_budget_exceeded',
    'execution_run_protocol_unsupported',
    'execution_run_target_unavailable',
    'execution_run_start_ambiguous',
    'execution_run_start_conflict',
    'run_depth_exceeded',
    'permission_denied',
]);
export const ExecutionRunStatusSchema = ExecutionRunStatusSchemaBase;
export const ExecutionRunListRequestSchema = ExecutionRunListRequestSchemaBase;
export const ExecutionRunErrorSchema = z.object({
    code: z.string().min(1),
    message: z.string().optional(),
}).passthrough();
export const ExecutionRunTranscriptSchema = z.object({
    persistenceMode: z.enum(['ephemeral', 'persistent']),
    epoch: z.number().int().min(0),
}).passthrough();
export const ExecutionRunPublicStateSchema = z.object({
    runId: z.string().min(1),
    callId: z.string().min(1),
    sidechainId: z.string().min(1),
    intent: ExecutionRunIntentSchema,
    backendTarget: BackendTargetRefSchema,
    display: ExecutionRunDisplaySchema.optional(),
    launchOrigin: ExecutionRunLaunchOriginSchema.optional(),
    // Policy/class fields are required for client surfaces (e.g. to decide if send/resume controls apply).
    permissionMode: z.string().min(1),
    retentionPolicy: ExecutionRunRetentionPolicySchema,
    runClass: ExecutionRunClassSchema,
    ioMode: ExecutionRunIoModeSchema,
    status: ExecutionRunStatusSchema,
    turnInFlight: z.boolean().optional(),
    availableActionIds: z.array(z.string().min(1)).optional(),
    resumeHandle: ExecutionRunResumeHandleSchema.optional(),
    transcript: ExecutionRunTranscriptSchema.optional(),
    startedAtMs: z.number().int().nonnegative(),
    finishedAtMs: z.number().int().nonnegative().optional(),
    error: ExecutionRunErrorSchema.optional(),
}).passthrough();
export const ExecutionRunListResponseSchema = z.object({
    runs: z.array(ExecutionRunPublicStateSchema),
}).passthrough();
export const ExecutionRunGetRequestSchema = z.object({
    runId: z.string().min(1),
    includeStructured: z.boolean().optional(),
}).passthrough();
export const ExecutionRunGetResponseSchema = z.object({
    run: ExecutionRunPublicStateSchema,
    latestToolResult: z.unknown().optional(),
    structuredMeta: z.object({ kind: z.string(), payload: z.unknown() }).passthrough().optional(),
    structuredMetaArtifactRef: z.object({ artifactId: z.string().min(1) }).passthrough().optional(),
}).passthrough();
export const ExecutionRunSendRequestSchema = z.object({
    runId: z.string().min(1),
    message: z.string().min(1),
    resume: z.boolean().optional(),
    delivery: z.enum(['prompt', 'steer_if_supported', 'interrupt']).optional(),
}).passthrough();
export const ExecutionRunSendResponseSchema = z.object({ ok: z.literal(true) }).passthrough();
export const ExecutionRunStopRequestSchema = z.object({ runId: z.string().min(1) }).passthrough();
export const ExecutionRunStopResponseSchema = z.object({ ok: z.literal(true) }).passthrough();
export const ExecutionRunEnsureRequestSchema = z.object({
    runId: z.string().min(1),
    resume: z.boolean().optional(),
}).passthrough();
export const ExecutionRunEnsureResponseSchema = z.union([
    z.object({ ok: z.literal(true) }).passthrough(),
    z.object({ ok: z.literal(false), error: z.string().min(1), errorCode: z.string().min(1).optional() }).passthrough(),
]);
export const ExecutionRunEnsureOrStartRequestSchema = z.object({
    runId: z.string().min(1).nullable().optional(),
    start: ExecutionRunStartRequestSchema.optional(),
    resume: z.boolean().optional(),
}).passthrough().superRefine((value, ctx) => {
    const runId = typeof value.runId === 'string' ? value.runId.trim() : '';
    if (!runId) {
        if (!value.start) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start is required when runId is missing' });
        }
    }
});
export const ExecutionRunEnsureOrStartResponseSchema = z.union([
    z.object({ ok: z.literal(true), runId: z.string().min(1), created: z.boolean() }).passthrough(),
    z.object({ ok: z.literal(false), error: z.string().min(1), errorCode: z.string().min(1).optional() }).passthrough(),
]);
export const ExecutionRunActionRequestSchema = z.object({
    runId: z.string().min(1),
    actionId: z.string().min(1),
    input: z.unknown().optional(),
}).passthrough();
export const ExecutionRunActionResponseSchema = z.object({
    ok: z.boolean(),
    updatedToolResult: z.unknown().optional(),
}).passthrough();
// Streaming turn IO (V1: used for intent='voice_agent').
export const ExecutionRunTurnStreamStartRequestSchema = z.object({
    runId: z.string().min(1),
    message: z.string().min(1),
    displayMessage: z.string().min(1).optional(),
    resume: z.boolean().optional(),
}).passthrough();
export const ExecutionRunUserTranscriptDirectiveSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('persist'),
        localId: PendingLocalIdSchema,
    }).passthrough(),
    z.object({
        mode: z.literal('suppress'),
    }).passthrough(),
]);
export const ExecutionRunTurnStreamStartV2RequestSchema = ExecutionRunTurnStreamStartRequestSchema.extend({
    userTranscript: ExecutionRunUserTranscriptDirectiveSchema,
});
export const ExecutionRunUserTranscriptCommitRequestSchema = z.object({
    runId: z.string().min(1),
    message: z.string().min(1),
    displayMessage: z.string().min(1).optional(),
    localId: PendingLocalIdSchema,
}).passthrough();
export const ExecutionRunUserTranscriptCommitResponseSchema = z.object({
    ok: z.literal(true),
}).passthrough();
export const ExecutionRunTurnStreamStartResponseSchema = z.object({
    streamId: z.string().min(1),
}).passthrough();
export const ExecutionRunTurnStreamReadRequestSchema = z.object({
    runId: z.string().min(1),
    streamId: z.string().min(1),
    cursor: z.number().int().min(0),
    maxEvents: z.number().int().min(1).max(256).optional(),
}).passthrough();
export const ExecutionRunTurnStreamEventDeltaSchema = z.object({
    t: z.literal('delta'),
    textDelta: z.string(),
}).passthrough();
export const ExecutionRunTurnStreamEventDoneSchema = z.object({
    t: z.literal('done'),
    assistantText: z.string(),
    actions: z.array(VoiceAssistantActionSchema).optional(),
}).passthrough();
export const ExecutionRunTurnStreamEventErrorSchema = z.object({
    t: z.literal('error'),
    error: z.string(),
    errorCode: z.string().optional(),
}).passthrough();
export const ExecutionRunTurnStreamEventSchema = z.discriminatedUnion('t', [
    ExecutionRunTurnStreamEventDeltaSchema,
    ExecutionRunTurnStreamEventDoneSchema,
    ExecutionRunTurnStreamEventErrorSchema,
]);
export const ExecutionRunTurnStreamReadResponseSchema = z.object({
    streamId: z.string().min(1),
    events: z.array(ExecutionRunTurnStreamEventSchema),
    nextCursor: z.number().int().min(0),
    done: z.boolean(),
}).passthrough();
export const ExecutionRunTurnStreamCancelRequestSchema = z.object({
    runId: z.string().min(1),
    streamId: z.string().min(1),
}).passthrough();
export const ExecutionRunTurnStreamCancelResponseSchema = z.object({
    ok: z.literal(true),
}).passthrough();
//# sourceMappingURL=executionRuns.js.map