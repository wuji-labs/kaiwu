import { z } from 'zod';
export const WorkspaceFaviconMimeTypeV1Schema = z.enum([
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
    'image/x-icon',
]);
export const WorkspaceFaviconResolveRequestV1Schema = z.object({
    workspacePath: z.string().min(1),
});
export const WorkspaceFaviconResolveResponseV1Schema = z.union([
    z.object({
        success: z.literal(true),
        found: z.literal(true),
        relativePath: z.string().min(1),
        mimeType: WorkspaceFaviconMimeTypeV1Schema,
        contentBase64: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
        modifiedMs: z.number().nonnegative().optional(),
    }),
    z.object({
        success: z.literal(true),
        found: z.literal(false),
    }),
    z.object({
        success: z.literal(false),
        errorCode: z.string(),
        error: z.string(),
    }),
]);
//# sourceMappingURL=v1.js.map