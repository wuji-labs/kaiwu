import { z } from 'zod';
import type { SessionMessageMeta } from './sessionMessageMeta.js';
export declare const ConnectedServiceSwitchAttemptedContinuityModeV1Schema: any;
export type ConnectedServiceSwitchAttemptedContinuityModeV1 = z.infer<typeof ConnectedServiceSwitchAttemptedContinuityModeV1Schema>;
export declare const ConnectedServiceSwitchAttemptOutcomeV1Schema: any;
export type ConnectedServiceSwitchAttemptOutcomeV1 = z.infer<typeof ConnectedServiceSwitchAttemptOutcomeV1Schema>;
export declare const ConnectedServiceSwitchAttemptOutcomeActionV1Schema: any;
export type ConnectedServiceSwitchAttemptOutcomeActionV1 = z.infer<typeof ConnectedServiceSwitchAttemptOutcomeActionV1Schema>;
export declare const ConnectedServiceSwitchAttemptSessionAdoptionV1Schema: any;
export type ConnectedServiceSwitchAttemptSessionAdoptionV1 = z.infer<typeof ConnectedServiceSwitchAttemptSessionAdoptionV1Schema>;
export declare const ConnectedServiceRuntimeAuthRecoveryTranscriptStatusV1Schema: any;
export type ConnectedServiceRuntimeAuthRecoveryTranscriptStatusV1 = z.infer<typeof ConnectedServiceRuntimeAuthRecoveryTranscriptStatusV1Schema>;
export declare const RuntimeConfigOutcomeStatusV1Schema: any;
export type RuntimeConfigOutcomeStatusV1 = z.infer<typeof RuntimeConfigOutcomeStatusV1Schema>;
export declare const RuntimeConfigOutcomeTimingV1Schema: any;
export type RuntimeConfigOutcomeTimingV1 = z.infer<typeof RuntimeConfigOutcomeTimingV1Schema>;
export declare const RuntimeConfigOutcomeChangeKeyV1Schema: any;
export type RuntimeConfigOutcomeChangeKeyV1 = z.infer<typeof RuntimeConfigOutcomeChangeKeyV1Schema>;
export type TranscriptRawRecordV1WithMeta<Meta> = (Record<string, unknown> & {
    role: 'agent';
    content: TranscriptRawAgentRecordV1;
    meta?: Meta;
}) | (Record<string, unknown> & {
    role: 'user';
    content: {
        type: 'text';
        text: string;
    } & Record<string, unknown>;
    meta?: Meta;
});
export declare function createTranscriptRawRecordV1Schema(zod: typeof z): z.ZodType<TranscriptRawRecordV1WithMeta<SessionMessageMeta>>;
export declare function createTranscriptRawRecordV1Schema<MetaSchema extends z.ZodTypeAny>(zod: typeof z, options: Readonly<{
    metaSchema: MetaSchema;
}>): z.ZodType<TranscriptRawRecordV1WithMeta<z.infer<MetaSchema>>>;
export declare const TranscriptRawRecordV1Schema: z.ZodType<TranscriptRawRecordV1WithMeta<z.infer<any>>>;
export type TranscriptRawRecordV1 = z.infer<typeof TranscriptRawRecordV1Schema>;
export declare const TranscriptRawUsageDataV1Schema: any;
export type TranscriptRawUsageDataV1 = z.infer<typeof TranscriptRawUsageDataV1Schema>;
export declare const TranscriptRawAgentEventV1Schema: any;
export type TranscriptRawAgentEventV1 = z.infer<typeof TranscriptRawAgentEventV1Schema>;
export declare const SessionMessageAttentionImpactSchema: any;
export type SessionMessageAttentionImpact = z.infer<typeof SessionMessageAttentionImpactSchema>;
export declare const SESSION_MESSAGE_USER_ATTENTION_IMPACT: SessionMessageAttentionImpact;
export declare const SESSION_MESSAGE_NO_USER_ATTENTION_IMPACT: SessionMessageAttentionImpact;
export declare function buildAgentEventLocalId(type: TranscriptRawAgentEventV1['type'], parts: ReadonlyArray<unknown>): string;
export declare function agentEventAttentionImpact(event: (Pick<TranscriptRawAgentEventV1, 'type'> & {
    status?: unknown;
}) | null | undefined, localId?: unknown): SessionMessageAttentionImpact;
export declare function agentEventLocalIdAttentionImpact(localId: string | null | undefined): SessionMessageAttentionImpact | null;
export declare const TranscriptRawAgentContentV1Schema: any;
export type TranscriptRawAgentContentV1 = z.infer<typeof TranscriptRawAgentContentV1Schema>;
export declare const TranscriptRawAgentRecordV1Schema: any;
export type TranscriptRawAgentRecordV1 = z.infer<typeof TranscriptRawAgentRecordV1Schema>;
//# sourceMappingURL=transcriptRawRecordV1.d.ts.map