import { z } from 'zod';
export type SessionUserMessageDeliveryIntentV1 = 'default' | 'explicit_pending' | 'explicit_immediate' | 'interrupt';
export declare const SESSION_USER_MESSAGE_DELIVERY_INTENT_META_KEY = "happierDeliveryIntentV1";
export declare function readSessionUserMessageDeliveryIntentMeta(meta: unknown): SessionUserMessageDeliveryIntentV1 | null;
export declare function withSessionUserMessageDeliveryIntentMeta(meta: Record<string, unknown> | null | undefined, intent: SessionUserMessageDeliveryIntentV1): Record<string, unknown> & {
    happierDeliveryIntentV1: SessionUserMessageDeliveryIntentV1;
};
/**
 * Message-level metadata (stored in encrypted message bodies).
 *
 * Forward compatibility is critical here: older clients must not fail to parse
 * messages when new fields or new enum values are introduced.
 */
export declare function createSessionMessageMetaSchema(zod: typeof z): any;
export declare const SessionMessageMetaSchema: any;
export type SessionMessageMeta = z.infer<typeof SessionMessageMetaSchema>;
//# sourceMappingURL=sessionMessageMeta.d.ts.map