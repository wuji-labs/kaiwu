import { z } from 'zod';
export declare const SESSION_MEDIA_MESSAGE_META_KIND_V1: "session_media.v1";
export declare const SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1 = 256;
export declare const SessionMediaOriginV1Schema: any;
export declare const SessionMediaReferenceV1Schema: any;
export declare const SessionMediaItemV1Schema: any;
export declare const SessionMediaUnavailableOriginV1Schema: any;
export declare const SessionMediaUnavailableV1Schema: any;
export declare const SessionMediaMessagePayloadV1Schema: any;
export declare const SessionMediaMessageMetaEnvelopeV1Schema: any;
export type SessionMediaOriginV1 = z.infer<typeof SessionMediaOriginV1Schema>;
export type SessionMediaReferenceV1 = z.infer<typeof SessionMediaReferenceV1Schema>;
export type SessionMediaItemV1 = z.infer<typeof SessionMediaItemV1Schema>;
export type SessionMediaUnavailableOriginV1 = z.infer<typeof SessionMediaUnavailableOriginV1Schema>;
export type SessionMediaUnavailableV1 = z.infer<typeof SessionMediaUnavailableV1Schema>;
export type SessionMediaMessagePayloadV1 = z.infer<typeof SessionMediaMessagePayloadV1Schema>;
export type SessionMediaMessageMetaEnvelopeV1 = z.infer<typeof SessionMediaMessageMetaEnvelopeV1Schema>;
//# sourceMappingURL=sessionMediaSchemas.d.ts.map