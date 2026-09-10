import { z } from 'zod';
function isAbsoluteWorkspacePath(value) {
    if (!value)
        return false;
    if (value.startsWith('/'))
        return true;
    if (/^[A-Za-z]:[\\/]/.test(value))
        return true;
    if (value.startsWith('\\\\'))
        return true;
    return false;
}
export const AbsoluteWorkspacePathSchema = z
    .string()
    .min(1)
    .refine(isAbsoluteWorkspacePath, 'workspace path must be absolute');
export const WorkspaceLocationScmSchema = z
    .object({
    provider: z.literal('git'),
    rootPath: AbsoluteWorkspacePathSchema,
})
    .strict();
//# sourceMappingURL=locationSchema.js.map