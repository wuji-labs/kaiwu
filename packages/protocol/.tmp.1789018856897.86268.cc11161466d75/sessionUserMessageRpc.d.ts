import { z } from 'zod';
import { type MentionRefV1 } from './mentionRefV1.js';
export declare const SESSION_ATTACHMENT_UPLOAD_STRUCTURED_INPUT_PROVENANCE_KIND = "sessionAttachmentUpload";
export declare const HAPPIER_STRUCTURED_INPUT_METADATA_KEY_V1 = "happierStructuredInputV1";
export declare const HAPPIER_VENDOR_PLUGIN_MENTIONS_METADATA_KEY = "happierVendorPluginMentions";
export declare const HAPPIER_SKILL_MENTIONS_METADATA_KEY = "happierSkillMentions";
type MetadataRecord = Record<string, unknown>;
export declare function readAttachmentEnvelopeLocalImagePaths(value: unknown): ReadonlySet<string>;
export declare const HappierStructuredInputV1EnvelopeSchema: any;
export type HappierStructuredInputV1Envelope = z.infer<typeof HappierStructuredInputV1EnvelopeSchema>;
export declare function sanitizeHappierStructuredInputV1(value: unknown, options?: Readonly<{
    allowedLocalImagePaths?: ReadonlySet<string>;
}>): HappierStructuredInputV1Envelope | null;
/**
 * Which reference source a consumer must enumerate (D-4). This is the single owner of the
 * precedence rule: a reader finding `mentions` uses it and ignores the legacy per-kind
 * arrays and the meta-root aliases entirely; legacy is read only when `mentions` is absent.
 *
 * It deliberately does NOT mutate the envelope. The envelope keeps both shapes so a
 * dual-written message still reads correctly on an older build; only the decision about
 * what to enumerate is centralized, which is what removes the duplicate provider items the
 * per-consumer `.concat()` produced (SB-5).
 */
export type StructuredInputMentionSourcesV1 = Readonly<{
    mentions: readonly MentionRefV1[];
    vendorPluginMentions: readonly MetadataRecord[];
    skillMentions: readonly MetadataRecord[];
}>;
export declare function readStructuredInputMentionSourcesV1(envelope: HappierStructuredInputV1Envelope | null | undefined): StructuredInputMentionSourcesV1;
/**
 * The canonical meta reader (SB-9). Before this existed every consumer re-read
 * `meta.happierStructuredInputV1` itself and concatenated the meta-root aliases without
 * dedupe. `../dev` consolidated this at `readHappierStructuredInputV1FromMeta`; this is the
 * same reader by intent, over remote-dev's envelope shape (which keeps `imageInputs` and
 * `attachments` as separate keys).
 */
export declare function readHappierStructuredInputV1FromMeta(value: unknown, options?: Readonly<{
    allowedLocalImagePaths?: ReadonlySet<string>;
}>): HappierStructuredInputV1Envelope | null;
export declare function admitStructuredInputMentionsForText(envelope: HappierStructuredInputV1Envelope, text: string): HappierStructuredInputV1Envelope;
/**
 * `text` is the composed admission input. The envelope sanitizer parses metadata
 * independently of the message it accompanies, so the half of the token contract that needs
 * the text — the message still contains the token — can only be enforced where both are in
 * hand. Pass it at the request boundary; a reference whose token the submitted text no longer
 * carries is rejected there, and its siblings are admitted (INV-4).
 */
export declare function sanitizeSessionUserMessageSendMeta(value: MetadataRecord, options?: Readonly<{
    allowedLocalImagePaths?: ReadonlySet<string>;
    text?: string;
}>): MetadataRecord;
export declare const SessionUserMessageSendMetaSchema: any;
export type SessionUserMessageSendMeta = z.infer<typeof SessionUserMessageSendMetaSchema>;
export declare const SessionUserMessageSendRequestSchema: any;
export type SessionUserMessageSendRequest = z.infer<typeof SessionUserMessageSendRequestSchema>;
export declare const SessionUserMessageSendResponseSchema: any;
export type SessionUserMessageSendResponse = z.infer<typeof SessionUserMessageSendResponseSchema>;
export {};
//# sourceMappingURL=sessionUserMessageRpc.d.ts.map