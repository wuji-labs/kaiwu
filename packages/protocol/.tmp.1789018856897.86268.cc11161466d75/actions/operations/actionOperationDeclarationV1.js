import { z } from 'zod';
export const ActionOperationDeclarationV1Schema = z
    .object({
    version: z.literal(1),
    visibility: z.literal('activity'),
    progress: z.enum(['indeterminate', 'reported']),
})
    .strict();
//# sourceMappingURL=actionOperationDeclarationV1.js.map