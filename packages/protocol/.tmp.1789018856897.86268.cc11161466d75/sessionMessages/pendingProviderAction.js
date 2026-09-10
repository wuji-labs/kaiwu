import { z } from 'zod';
export const PendingProviderActionSchema = z.enum([
    'send',
    'steer',
    'interrupt_and_send',
]);
//# sourceMappingURL=pendingProviderAction.js.map