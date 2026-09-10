import { z } from 'zod';
import { createSentFromSchema } from '../sentFrom.js';
import { createSessionPermissionModeSchema } from '../sessionMetadata/sessionPermissionModes.js';
const SESSION_USER_MESSAGE_DELIVERY_INTENTS = new Set([
    'default',
    'explicit_pending',
    'explicit_immediate',
    'interrupt',
]);
export const SESSION_USER_MESSAGE_DELIVERY_INTENT_META_KEY = 'happierDeliveryIntentV1';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function readSessionUserMessageDeliveryIntentMeta(meta) {
    if (!isRecord(meta))
        return null;
    const value = meta[SESSION_USER_MESSAGE_DELIVERY_INTENT_META_KEY];
    return typeof value === 'string' && SESSION_USER_MESSAGE_DELIVERY_INTENTS.has(value)
        ? value
        : null;
}
export function withSessionUserMessageDeliveryIntentMeta(meta, intent) {
    return {
        ...(meta ?? {}),
        [SESSION_USER_MESSAGE_DELIVERY_INTENT_META_KEY]: intent,
    };
}
/**
 * Message-level metadata (stored in encrypted message bodies).
 *
 * Forward compatibility is critical here: older clients must not fail to parse
 * messages when new fields or new enum values are introduced.
 */
export function createSessionMessageMetaSchema(zod) {
    return zod
        .object({
        sentFrom: createSentFromSchema(zod).optional(),
        /**
         * High-level origin of the message, used by agents to avoid treating
         * self-sent client traffic as a "new prompt" event.
         *
         * Forward-compatible: unknown strings are allowed.
         */
        source: zod.union([zod.enum(['ui', 'cli']), zod.string()]).optional(),
        permissionMode: createSessionPermissionModeSchema(zod).optional(),
        model: zod.string().nullable().optional(),
        fallbackModel: zod.string().nullable().optional(),
        customSystemPrompt: zod.string().nullable().optional(),
        appendSystemPrompt: zod.string().nullable().optional(),
        allowedTools: zod.array(zod.string()).nullable().optional(),
        disallowedTools: zod.array(zod.string()).nullable().optional(),
        displayText: zod.string().optional(),
        happier: zod
            .object({
            kind: zod.string(),
            payload: zod.unknown(),
        })
            .optional(),
    })
        .passthrough();
}
export const SessionMessageMetaSchema = createSessionMessageMetaSchema(z);
//# sourceMappingURL=sessionMessageMeta.js.map