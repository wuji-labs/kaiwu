import { z } from 'zod';
export const SocialFriendsCapabilitiesSchema = z.object({
    allowUsername: z.boolean(),
    requiredIdentityProviderId: z.string().nullable(),
});
export const DEFAULT_SOCIAL_FRIENDS_CAPABILITIES = {
    allowUsername: false,
    requiredIdentityProviderId: null,
};
//# sourceMappingURL=socialFriendsCapabilities.js.map