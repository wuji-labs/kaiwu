import { z } from 'zod';
export declare const UpdateBodySchema: any;
export type UpdateBody = z.infer<typeof UpdateBodySchema>;
export declare const UpdateContainerSchema: any;
export type UpdateContainer = z.infer<typeof UpdateContainerSchema>;
export declare const TranscriptStreamSegmentEphemeralMessageSchema: any;
/**
 * Delta form of the live transcript segment stream.
 *
 * `content` is the same stored-message envelope as the snapshot form (encrypted or plain), but the
 * ACP body inside carries ONLY the text appended since the previous live emission for this segment.
 * Receivers reconstruct the accumulated text from per-segment assembly state and MUST drop the
 * delta (and wait for the next full-snapshot checkpoint) on any gap: unknown segment, unexpected
 * `tick`, or `baseLength` mismatch.
 */
export declare const TranscriptStreamSegmentDeltaEphemeralMessageSchema: any;
export declare const DirectSessionTranscriptDeltaEphemeralSchema: any;
export declare const EphemeralUpdateSchema: any;
export type EphemeralUpdate = z.infer<typeof EphemeralUpdateSchema>;
export type DirectSessionTranscriptDeltaEphemeral = z.infer<typeof DirectSessionTranscriptDeltaEphemeralSchema>;
export declare const SessionBroadcastBodySchema: any;
export type SessionBroadcastBody = z.infer<typeof SessionBroadcastBodySchema>;
export declare const SessionBroadcastContainerSchema: any;
export type SessionBroadcastContainer = z.infer<typeof SessionBroadcastContainerSchema>;
export declare const MessageAckResponseSchema: any;
export type MessageAckResponse = z.infer<typeof MessageAckResponseSchema>;
export declare const SessionEndAckResponseSchema: any;
export type SessionEndAckResponse = z.infer<typeof SessionEndAckResponseSchema>;
export declare const UpdateMetadataAckResponseSchema: any;
export type UpdateMetadataAckResponse = z.infer<typeof UpdateMetadataAckResponseSchema>;
export declare const UpdateStateAckResponseSchema: any;
export type UpdateStateAckResponse = z.infer<typeof UpdateStateAckResponseSchema>;
//# sourceMappingURL=updates.d.ts.map