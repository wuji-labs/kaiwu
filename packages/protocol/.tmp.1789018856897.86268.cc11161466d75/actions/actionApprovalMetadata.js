import { z } from 'zod';
export const ActionApprovalFlowSchema = z.enum(['blocking', 'deferred']);
export const ActionApprovalResultSchema = z.enum(['required', 'optional', 'none']);
export const ActionApprovalSchema = z
    .object({
    flow: ActionApprovalFlowSchema.optional(),
    result: ActionApprovalResultSchema,
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.result === 'optional' && value.flow == null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['flow'],
            message: 'optional approval results require an explicit flow',
        });
    }
});
export function resolveActionApprovalFlow(approval) {
    if (approval.flow)
        return approval.flow;
    return approval.result === 'required' ? 'blocking' : 'deferred';
}
//# sourceMappingURL=actionApprovalMetadata.js.map