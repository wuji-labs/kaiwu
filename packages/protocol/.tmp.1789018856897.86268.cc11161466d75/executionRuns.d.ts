import { z } from 'zod';
import { ExecutionRunClassSchema, type ExecutionRunClass, ExecutionRunDisplaySchema, type ExecutionRunDisplay, ExecutionRunLaunchOriginSchema, type ExecutionRunLaunchOrigin, ExecutionRunIntentSchema, type ExecutionRunIntent, ExecutionRunIoModeSchema, type ExecutionRunIoMode, ExecutionRunReplaySeedRequestSchema, type ExecutionRunReplaySeedRequest, ExecutionRunResumeHandleSchema, type ExecutionRunResumeHandle, ExecutionRunResumeHandleVendorSessionV1Schema, type ExecutionRunResumeHandleVendorSessionV1, ExecutionRunResumeHandleVoiceAgentSessionsV1Schema, type ExecutionRunResumeHandleVoiceAgentSessionsV1, ExecutionRunRetentionPolicySchema, type ExecutionRunRetentionPolicy, ExecutionRunStartRequestSchema, type ExecutionRunStartRequest, ExecutionRunStartResponseSchema, type ExecutionRunStartResponse, normalizeLegacyExecutionRunBackendTargetInput } from './executionRunStartRequest.js';
/**
 * Public contract for execution runs (sub-agents / reviews / planning / delegation / voice agent).
 *
 * Notes:
 * - This schema is used by session-scoped RPC + MCP and must remain stable and bounded.
 * - Rich/large UI payloads (e.g. full review findings) are carried via transcript message `meta.happier`.
 */
export { ExecutionRunIntentSchema, ExecutionRunRetentionPolicySchema, ExecutionRunClassSchema, ExecutionRunIoModeSchema, normalizeLegacyExecutionRunBackendTargetInput, ExecutionRunResumeHandleVendorSessionV1Schema, ExecutionRunResumeHandleVoiceAgentSessionsV1Schema, ExecutionRunResumeHandleSchema, ExecutionRunDisplaySchema, ExecutionRunLaunchOriginSchema, ExecutionRunReplaySeedRequestSchema, ExecutionRunStartRequestSchema, ExecutionRunStartResponseSchema, };
export type { ExecutionRunIntent, ExecutionRunRetentionPolicy, ExecutionRunClass, ExecutionRunIoMode, ExecutionRunResumeHandleVendorSessionV1, ExecutionRunResumeHandleVoiceAgentSessionsV1, ExecutionRunResumeHandle, ExecutionRunDisplay, ExecutionRunLaunchOrigin, ExecutionRunReplaySeedRequest, ExecutionRunStartRequest, ExecutionRunStartResponse, };
export declare const ExecutionRunTransportErrorCodeSchema: any;
export type ExecutionRunTransportErrorCode = z.infer<typeof ExecutionRunTransportErrorCodeSchema>;
export declare const ExecutionRunStatusSchema: any;
export type ExecutionRunStatus = z.infer<typeof ExecutionRunStatusSchema>;
export declare const ExecutionRunListRequestSchema: any;
export type ExecutionRunListRequest = z.infer<typeof ExecutionRunListRequestSchema>;
export declare const ExecutionRunErrorSchema: any;
export type ExecutionRunError = z.infer<typeof ExecutionRunErrorSchema>;
export declare const ExecutionRunTranscriptSchema: any;
export type ExecutionRunTranscript = z.infer<typeof ExecutionRunTranscriptSchema>;
export declare const ExecutionRunPublicStateSchema: any;
export type ExecutionRunPublicState = z.infer<typeof ExecutionRunPublicStateSchema>;
export declare const ExecutionRunListResponseSchema: any;
export type ExecutionRunListResponse = z.infer<typeof ExecutionRunListResponseSchema>;
export declare const ExecutionRunGetRequestSchema: any;
export type ExecutionRunGetRequest = z.infer<typeof ExecutionRunGetRequestSchema>;
export declare const ExecutionRunGetResponseSchema: any;
export type ExecutionRunGetResponse = z.infer<typeof ExecutionRunGetResponseSchema>;
export declare const ExecutionRunSendRequestSchema: any;
export type ExecutionRunSendRequest = z.infer<typeof ExecutionRunSendRequestSchema>;
export declare const ExecutionRunSendResponseSchema: any;
export type ExecutionRunSendResponse = z.infer<typeof ExecutionRunSendResponseSchema>;
export declare const ExecutionRunStopRequestSchema: any;
export type ExecutionRunStopRequest = z.infer<typeof ExecutionRunStopRequestSchema>;
export declare const ExecutionRunStopResponseSchema: any;
export type ExecutionRunStopResponse = z.infer<typeof ExecutionRunStopResponseSchema>;
export declare const ExecutionRunEnsureRequestSchema: any;
export type ExecutionRunEnsureRequest = z.infer<typeof ExecutionRunEnsureRequestSchema>;
export declare const ExecutionRunEnsureResponseSchema: any;
export type ExecutionRunEnsureResponse = z.infer<typeof ExecutionRunEnsureResponseSchema>;
export declare const ExecutionRunEnsureOrStartRequestSchema: any;
export type ExecutionRunEnsureOrStartRequest = z.infer<typeof ExecutionRunEnsureOrStartRequestSchema>;
export declare const ExecutionRunEnsureOrStartResponseSchema: any;
export type ExecutionRunEnsureOrStartResponse = z.infer<typeof ExecutionRunEnsureOrStartResponseSchema>;
export declare const ExecutionRunActionRequestSchema: any;
export type ExecutionRunActionRequest = z.infer<typeof ExecutionRunActionRequestSchema>;
export declare const ExecutionRunActionResponseSchema: any;
export type ExecutionRunActionResponse = z.infer<typeof ExecutionRunActionResponseSchema>;
export declare const ExecutionRunTurnStreamStartRequestSchema: any;
export type ExecutionRunTurnStreamStartRequest = z.infer<typeof ExecutionRunTurnStreamStartRequestSchema>;
export declare const ExecutionRunUserTranscriptDirectiveSchema: any;
export type ExecutionRunUserTranscriptDirective = z.infer<typeof ExecutionRunUserTranscriptDirectiveSchema>;
export declare const ExecutionRunTurnStreamStartV2RequestSchema: any;
export type ExecutionRunTurnStreamStartV2Request = z.infer<typeof ExecutionRunTurnStreamStartV2RequestSchema>;
export declare const ExecutionRunUserTranscriptCommitRequestSchema: any;
export type ExecutionRunUserTranscriptCommitRequest = z.infer<typeof ExecutionRunUserTranscriptCommitRequestSchema>;
export declare const ExecutionRunUserTranscriptCommitResponseSchema: any;
export type ExecutionRunUserTranscriptCommitResponse = z.infer<typeof ExecutionRunUserTranscriptCommitResponseSchema>;
export declare const ExecutionRunTurnStreamStartResponseSchema: any;
export type ExecutionRunTurnStreamStartResponse = z.infer<typeof ExecutionRunTurnStreamStartResponseSchema>;
export declare const ExecutionRunTurnStreamReadRequestSchema: any;
export type ExecutionRunTurnStreamReadRequest = z.infer<typeof ExecutionRunTurnStreamReadRequestSchema>;
export declare const ExecutionRunTurnStreamEventDeltaSchema: any;
export type ExecutionRunTurnStreamEventDelta = z.infer<typeof ExecutionRunTurnStreamEventDeltaSchema>;
export declare const ExecutionRunTurnStreamEventDoneSchema: any;
export type ExecutionRunTurnStreamEventDone = z.infer<typeof ExecutionRunTurnStreamEventDoneSchema>;
export declare const ExecutionRunTurnStreamEventErrorSchema: any;
export type ExecutionRunTurnStreamEventError = z.infer<typeof ExecutionRunTurnStreamEventErrorSchema>;
export declare const ExecutionRunTurnStreamEventSchema: any;
export type ExecutionRunTurnStreamEvent = z.infer<typeof ExecutionRunTurnStreamEventSchema>;
export declare const ExecutionRunTurnStreamReadResponseSchema: any;
export type ExecutionRunTurnStreamReadResponse = z.infer<typeof ExecutionRunTurnStreamReadResponseSchema>;
export declare const ExecutionRunTurnStreamCancelRequestSchema: any;
export type ExecutionRunTurnStreamCancelRequest = z.infer<typeof ExecutionRunTurnStreamCancelRequestSchema>;
export declare const ExecutionRunTurnStreamCancelResponseSchema: any;
export type ExecutionRunTurnStreamCancelResponse = z.infer<typeof ExecutionRunTurnStreamCancelResponseSchema>;
//# sourceMappingURL=executionRuns.d.ts.map