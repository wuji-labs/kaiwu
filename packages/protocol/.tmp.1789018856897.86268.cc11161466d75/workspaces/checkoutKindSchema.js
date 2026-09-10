import { z } from 'zod';
export const WorkspaceCheckoutKindSchema = z.enum([
    'primary',
    'git_worktree',
]);
//# sourceMappingURL=checkoutKindSchema.js.map