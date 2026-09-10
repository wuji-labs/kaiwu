import { z } from 'zod';
export const CodexAppServerPermissionsProfileSchema = z.record(z.string(), z.unknown());
export const CodexAppServerTurnPermissionFieldsSchema = z
    .object({
    permissions: CodexAppServerPermissionsProfileSchema.optional(),
    sandboxPolicy: z.unknown().optional(),
    approvalPolicy: z.string().optional(),
    approvalsReviewer: z.string().optional(),
    sandbox: z.unknown().optional(),
})
    .passthrough()
    .superRefine((value, ctx) => {
    if (value.permissions !== undefined && value.sandboxPolicy !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'permissions and sandboxPolicy cannot be combined',
            path: ['sandboxPolicy'],
        });
    }
});
//# sourceMappingURL=appServerPermissions.js.map