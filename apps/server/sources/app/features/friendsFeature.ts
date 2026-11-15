import type { FeaturesPayloadDelta } from "./types";

export function resolveFriendsFeature(_env: NodeJS.ProcessEnv): FeaturesPayloadDelta {
    return {
        features: {
            social: {
                friends: {
                    enabled: false,
                },
            },
        },
        capabilities: {
            social: {
                friends: {
                    allowUsername: false,
                    requiredIdentityProviderId: null,
                },
            },
        },
    };
}
