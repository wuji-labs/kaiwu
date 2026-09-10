import { z } from 'zod';
export const OAuthProviderStatusSchema = z.object({
    enabled: z.boolean(),
    configured: z.boolean(),
});
//# sourceMappingURL=oauthProviderStatus.js.map