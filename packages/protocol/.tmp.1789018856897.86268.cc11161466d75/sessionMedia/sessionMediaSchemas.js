import { z } from 'zod';
export const SESSION_MEDIA_MESSAGE_META_KIND_V1 = 'session_media.v1';
export const SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1 = 256;
const SafeStringSchema = z.string().trim().min(1).max(512);
const OriginIdentifierSchema = z.string().trim().min(1).max(16_384);
const SessionMediaOriginSourceV1Schema = z.enum([
    'user-upload',
    'provider-generated',
    'tool-output',
    'acp-content',
    'mcp-content',
    'local-file',
]);
const SessionMediaPathSchema = z
    .string()
    .trim()
    .min(1)
    .max(16_384)
    .superRefine((path, ctx) => {
    const lowerPath = path.toLowerCase();
    if (path.startsWith('/') ||
        path.startsWith('\\') ||
        /^[a-z]:[\\/]/i.test(path) ||
        /^[a-z][a-z0-9+.-]*:/i.test(path) ||
        lowerPath.startsWith('file://') ||
        lowerPath.startsWith('data:') ||
        lowerPath.startsWith('http://') ||
        lowerPath.startsWith('https://') ||
        path.includes('\\')) {
        ctx.addIssue({ code: 'custom', message: 'Session media path must be a relative session file path' });
        return;
    }
    const segments = path.split('/');
    if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
        ctx.addIssue({ code: 'custom', message: 'Session media path must not contain empty or traversal segments' });
    }
});
export const SessionMediaOriginV1Schema = z
    .object({
    source: SessionMediaOriginSourceV1Schema,
    agentId: OriginIdentifierSchema.optional(),
    toolCallId: OriginIdentifierSchema.optional(),
    generationId: OriginIdentifierSchema.optional(),
    providerEventId: OriginIdentifierSchema.optional(),
    providerFileId: OriginIdentifierSchema.optional(),
})
    .strict();
export const SessionMediaReferenceV1Schema = z
    .object({
    mediaKind: z.literal('image'),
    path: SessionMediaPathSchema,
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
    sizeBytes: z.number().int().positive(),
})
    .strict();
export const SessionMediaItemV1Schema = z
    .object({
    id: SafeStringSchema,
    role: z.enum(['input', 'output']),
    category: z.enum(['attachment', 'generated', 'tool-artifact']),
    mediaKind: z.literal('image'),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
    name: SafeStringSchema,
    path: SessionMediaPathSchema,
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    createdAtMs: z.number().int().nonnegative().optional(),
    description: z.string().trim().min(1).max(16_384).optional(),
    references: z.array(SessionMediaReferenceV1Schema).max(64).optional(),
    origin: SessionMediaOriginV1Schema,
})
    .strict();
export const SessionMediaUnavailableOriginV1Schema = z
    .object({
    source: SessionMediaOriginSourceV1Schema,
    agentId: SafeStringSchema.optional(),
    toolCallIdHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    generationIdHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
})
    .strict();
export const SessionMediaUnavailableV1Schema = z
    .object({
    id: SafeStringSchema,
    role: z.enum(['input', 'output']),
    category: z.enum(['attachment', 'generated', 'tool-artifact']),
    mediaKind: z.literal('image'),
    code: z.string().trim().min(1).max(128).regex(/^[a-z0-9._-]+$/),
    origin: SessionMediaUnavailableOriginV1Schema,
})
    .strict();
export const SessionMediaMessagePayloadV1Schema = z
    .object({
    media: z.array(SessionMediaItemV1Schema).max(SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1),
    unavailable: z.array(SessionMediaUnavailableV1Schema).max(SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1).optional(),
})
    .strict()
    .superRefine((payload, ctx) => {
    const unavailableCount = payload.unavailable?.length ?? 0;
    if (payload.media.length + unavailableCount === 0) {
        ctx.addIssue({ code: 'custom', message: 'Session media envelope must contain media or unavailable states' });
    }
    if (payload.media.length + unavailableCount > SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1) {
        ctx.addIssue({
            code: 'custom',
            message: `Session media envelope must contain at most ${SESSION_MEDIA_MESSAGE_MAX_ENTRIES_V1} entries`,
        });
    }
});
export const SessionMediaMessageMetaEnvelopeV1Schema = z
    .object({
    kind: z.literal(SESSION_MEDIA_MESSAGE_META_KIND_V1),
    payload: SessionMediaMessagePayloadV1Schema,
})
    .strict();
//# sourceMappingURL=sessionMediaSchemas.js.map