import { z } from 'zod';
export declare const SESSION_TRANSCRIPT_OBSERVATION_CAPABILITY_V1: "session-transcript-observation-v1";
export declare const SESSION_TRANSCRIPT_OBSERVATION_CAPABILITY_EVENT_V1: "transcript-observation-capability-v1";
export declare const SESSION_TRANSCRIPT_OBSERVATION_EVENT_V1: "transcript-observation-v1";
export declare const SessionTranscriptObservationProvenanceV1Schema: any;
export type SessionTranscriptObservationProvenanceV1 = z.infer<typeof SessionTranscriptObservationProvenanceV1Schema>;
export declare function isRecoveredHistoryTranscriptObservationProvenance(value: unknown): value is SessionTranscriptObservationProvenanceV1 & {
    source: 'history';
};
export declare const SessionTranscriptObservationV1Schema: any;
export type SessionTranscriptObservationV1 = z.infer<typeof SessionTranscriptObservationV1Schema>;
export declare const SessionTranscriptObservationCapabilityAckV1Schema: any;
export declare const SessionTranscriptObservationAckV1Schema: any;
export type SessionTranscriptObservationCapabilityAckV1 = z.infer<typeof SessionTranscriptObservationCapabilityAckV1Schema>;
export type SessionTranscriptObservationAckV1 = z.infer<typeof SessionTranscriptObservationAckV1Schema>;
//# sourceMappingURL=transcriptObservationV1.d.ts.map