import { z } from 'zod';
import { MentionRefV1Schema, admitMentionRefsV1ForText, sanitizeMentionRefsV1, } from './mentionRefV1.js';
import { PendingLocalIdSchema } from './sessionMessages/pendingLocalId.js';
export const SESSION_ATTACHMENT_UPLOAD_STRUCTURED_INPUT_PROVENANCE_KIND = 'sessionAttachmentUpload';
export const HAPPIER_STRUCTURED_INPUT_METADATA_KEY_V1 = 'happierStructuredInputV1';
export const HAPPIER_VENDOR_PLUGIN_MENTIONS_METADATA_KEY = 'happierVendorPluginMentions';
export const HAPPIER_SKILL_MENTIONS_METADATA_KEY = 'happierSkillMentions';
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function asRecordArray(value) {
    return Array.isArray(value) ? value.map(asRecord).filter((entry) => Boolean(entry)) : [];
}
function readString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function hasUploadedAttachmentProvenance(value) {
    return asRecord(value)?.kind === SESSION_ATTACHMENT_UPLOAD_STRUCTURED_INPUT_PROVENANCE_KIND;
}
function normalizeSessionAttachmentUploadPath(value) {
    const path = readString(value);
    if (!path || path.includes('\0'))
        return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path))
        return null;
    const normalized = path.replace(/[\\]+/g, '/');
    const segments = normalized.split('/').filter((segment) => segment.length > 0);
    if (segments.some((segment) => segment === '.' || segment === '..'))
        return null;
    if (segments.length >= 5
        && segments[0] === '.happier'
        && segments[1] === 'uploads'
        && segments[2] === 'messages') {
        return normalized;
    }
    const tempRootIndex = segments.findIndex((segment, index) => {
        return segment === 'happier'
            && segments[index + 1] === 'uploads'
            && typeof segments[index + 2] === 'string'
            && segments[index + 3] === 'messages'
            && typeof segments[index + 4] === 'string'
            && typeof segments[index + 5] === 'string';
    });
    return tempRootIndex >= 0 ? normalized : null;
}
function isImageAttachment(entry) {
    const kind = readString(entry.kind);
    const type = readString(entry.type);
    const mimeType = readString(entry.mimeType);
    return kind === 'image'
        || type === 'image'
        || type === 'localImage'
        || mimeType?.toLowerCase().startsWith('image/') === true;
}
function readAttachmentEnvelope(value) {
    const happier = asRecord(value.happier);
    if (happier?.kind !== 'attachments.v1')
        return [];
    const payload = asRecord(happier.payload);
    return asRecordArray(payload?.attachments);
}
export function readAttachmentEnvelopeLocalImagePaths(value) {
    const meta = asRecord(value);
    const paths = new Set();
    if (!meta)
        return paths;
    for (const attachment of readAttachmentEnvelope(meta)) {
        if (!isImageAttachment(attachment))
            continue;
        const normalizedPath = normalizeSessionAttachmentUploadPath(attachment.path);
        if (normalizedPath) {
            paths.add(normalizedPath);
        }
    }
    return paths;
}
function sanitizeStructuredAttachments(value, options = {}) {
    const attachments = [];
    for (const attachment of asRecordArray(value)) {
        if (!isImageAttachment(attachment))
            continue;
        const localPath = readString(attachment.localPath ?? attachment.path);
        if (localPath) {
            if (!hasUploadedAttachmentProvenance(attachment.provenance))
                continue;
            const normalizedLocalPath = normalizeSessionAttachmentUploadPath(localPath);
            if (!normalizedLocalPath)
                continue;
            if (!options.allowedLocalImagePaths?.has(normalizedLocalPath))
                continue;
            attachments.push({
                ...attachment,
                localPath: normalizedLocalPath,
                path: normalizeSessionAttachmentUploadPath(attachment.path) ?? normalizedLocalPath,
                provenance: {
                    ...asRecord(attachment.provenance),
                    kind: SESSION_ATTACHMENT_UPLOAD_STRUCTURED_INPUT_PROVENANCE_KIND,
                },
            });
            continue;
        }
        const url = readString(attachment.url);
        if (url) {
            attachments.push({
                ...attachment,
                url,
            });
        }
    }
    return attachments;
}
export const HappierStructuredInputV1EnvelopeSchema = z.object({
    v: z.literal(1).default(1),
    /**
     * The open, additive reference list (R-4). It carries every composer reference kind, so a
     * new kind never needs a new per-kind array and never needs an envelope version bump.
     * Readers apply D-4 precedence through `readStructuredInputMentionSourcesV1`.
     */
    mentions: z.array(MentionRefV1Schema).optional(),
    vendorPluginMentions: z.array(z.record(z.string(), z.unknown())).optional(),
    skillMentions: z.array(z.record(z.string(), z.unknown())).optional(),
    imageInputs: z.array(z.record(z.string(), z.unknown())).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();
export function sanitizeHappierStructuredInputV1(value, options = {}) {
    const envelope = asRecord(value);
    if (!envelope)
        return null;
    const mentions = sanitizeMentionRefsV1(envelope.mentions);
    const vendorPluginMentions = asRecordArray(envelope.vendorPluginMentions);
    const skillMentions = asRecordArray(envelope.skillMentions);
    const imageInputs = sanitizeStructuredAttachments(envelope.imageInputs, options);
    const attachments = sanitizeStructuredAttachments(envelope.attachments, options);
    const sanitized = {
        ...envelope,
        v: 1,
    };
    if (mentions.length > 0) {
        sanitized.mentions = mentions;
    }
    else {
        delete sanitized.mentions;
    }
    if (vendorPluginMentions.length > 0) {
        sanitized.vendorPluginMentions = vendorPluginMentions;
    }
    else {
        delete sanitized.vendorPluginMentions;
    }
    if (skillMentions.length > 0) {
        sanitized.skillMentions = skillMentions;
    }
    else {
        delete sanitized.skillMentions;
    }
    if (imageInputs.length > 0) {
        sanitized.imageInputs = imageInputs;
    }
    else {
        delete sanitized.imageInputs;
    }
    if (attachments.length > 0) {
        sanitized.attachments = attachments;
    }
    else {
        delete sanitized.attachments;
    }
    return HappierStructuredInputV1EnvelopeSchema.parse(sanitized);
}
/**
 * The envelope array and the meta-root alias are two historical write shapes for the same
 * mention. Folding them used to be a bare `.concat()`, so a message carrying both sent the
 * mention to the provider twice (SB-5). Identity is the whole record: a mention repeated at
 * two composer positions carries identical provider context and must still yield one item
 * (D-26).
 */
function dedupeMentionRecords(records) {
    const deduped = [];
    const seen = new Set();
    for (const record of records) {
        const key = JSON.stringify(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(record);
    }
    return deduped;
}
export function readStructuredInputMentionSourcesV1(envelope) {
    const mentions = envelope?.mentions ?? [];
    if (mentions.length > 0) {
        return { mentions, vendorPluginMentions: [], skillMentions: [] };
    }
    return {
        mentions: [],
        vendorPluginMentions: asRecordArray(envelope?.vendorPluginMentions),
        skillMentions: asRecordArray(envelope?.skillMentions),
    };
}
/**
 * The canonical meta reader (SB-9). Before this existed every consumer re-read
 * `meta.happierStructuredInputV1` itself and concatenated the meta-root aliases without
 * dedupe. `../dev` consolidated this at `readHappierStructuredInputV1FromMeta`; this is the
 * same reader by intent, over remote-dev's envelope shape (which keeps `imageInputs` and
 * `attachments` as separate keys).
 */
export function readHappierStructuredInputV1FromMeta(value, options = {}) {
    const metadata = asRecord(value);
    if (!metadata)
        return null;
    const structuredInput = sanitizeHappierStructuredInputV1(metadata[HAPPIER_STRUCTURED_INPUT_METADATA_KEY_V1], options);
    // The meta-root aliases are a legacy write shape, folded into the envelope here — but only
    // when the envelope carries no `mentions`. With `mentions` present they are ignored
    // entirely (D-4), which is what stops a dual-written message from reaching a provider twice.
    const mentions = structuredInput?.mentions ?? [];
    const aliasVendorPluginMentions = mentions.length === 0
        ? asRecordArray(metadata[HAPPIER_VENDOR_PLUGIN_MENTIONS_METADATA_KEY])
        : [];
    const aliasSkillMentions = mentions.length === 0
        ? asRecordArray(metadata[HAPPIER_SKILL_MENTIONS_METADATA_KEY])
        : [];
    if (!structuredInput) {
        if (aliasVendorPluginMentions.length === 0 && aliasSkillMentions.length === 0)
            return null;
        return HappierStructuredInputV1EnvelopeSchema.parse({
            v: 1,
            ...(aliasVendorPluginMentions.length > 0 ? { vendorPluginMentions: aliasVendorPluginMentions } : {}),
            ...(aliasSkillMentions.length > 0 ? { skillMentions: aliasSkillMentions } : {}),
        });
    }
    if (aliasVendorPluginMentions.length === 0 && aliasSkillMentions.length === 0)
        return structuredInput;
    const merged = { ...structuredInput };
    const vendorPluginMentions = dedupeMentionRecords([
        ...asRecordArray(structuredInput.vendorPluginMentions),
        ...aliasVendorPluginMentions,
    ]);
    const skillMentions = dedupeMentionRecords([
        ...asRecordArray(structuredInput.skillMentions),
        ...aliasSkillMentions,
    ]);
    if (vendorPluginMentions.length > 0)
        merged.vendorPluginMentions = vendorPluginMentions;
    if (skillMentions.length > 0)
        merged.skillMentions = skillMentions;
    return HappierStructuredInputV1EnvelopeSchema.parse(merged);
}
export function admitStructuredInputMentionsForText(envelope, text) {
    const mentions = envelope.mentions ?? [];
    if (mentions.length === 0)
        return envelope;
    const admitted = admitMentionRefsV1ForText(text, mentions);
    if (admitted.length === mentions.length)
        return envelope;
    const next = { ...envelope };
    if (admitted.length > 0) {
        next.mentions = admitted;
    }
    else {
        delete next.mentions;
    }
    return HappierStructuredInputV1EnvelopeSchema.parse(next);
}
/**
 * `text` is the composed admission input. The envelope sanitizer parses metadata
 * independently of the message it accompanies, so the half of the token contract that needs
 * the text — the message still contains the token — can only be enforced where both are in
 * hand. Pass it at the request boundary; a reference whose token the submitted text no longer
 * carries is rejected there, and its siblings are admitted (INV-4).
 */
export function sanitizeSessionUserMessageSendMeta(value, options = {}) {
    const meta = { ...value };
    const structuredInput = sanitizeHappierStructuredInputV1(meta.happierStructuredInputV1, options);
    if (structuredInput) {
        meta.happierStructuredInputV1 = typeof options.text === 'string'
            ? admitStructuredInputMentionsForText(structuredInput, options.text)
            : structuredInput;
    }
    else if (Object.prototype.hasOwnProperty.call(meta, 'happierStructuredInputV1')) {
        delete meta.happierStructuredInputV1;
    }
    return meta;
}
export const SessionUserMessageSendMetaSchema = z
    .record(z.string(), z.unknown())
    .transform((value) => sanitizeSessionUserMessageSendMeta(value));
export const SessionUserMessageSendRequestSchema = z.object({
    text: z.string().min(1),
    localId: PendingLocalIdSchema.optional(),
    meta: SessionUserMessageSendMetaSchema.default({}),
}).passthrough();
const SessionUserMessageSendSuccessResponseSchema = z.object({
    ok: z.literal(true),
    providerAcceptancePending: z.boolean().optional(),
}).passthrough();
const SessionUserMessageSendErrorResponseSchema = z.object({
    ok: z.literal(false),
    error: z.string().min(1),
    errorCode: z.string().min(1),
}).passthrough();
export const SessionUserMessageSendResponseSchema = z.union([
    SessionUserMessageSendSuccessResponseSchema,
    SessionUserMessageSendErrorResponseSchema,
]);
//# sourceMappingURL=sessionUserMessageRpc.js.map