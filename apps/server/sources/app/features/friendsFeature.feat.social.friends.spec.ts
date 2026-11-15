import { describe, expect, it } from "vitest";

import { resolveFriendsFeature } from "./friendsFeature";

describe("resolveFriendsFeature", () => {
    it("defaults to friends disabled after route removal", () => {
        const feature = resolveFriendsFeature({} as NodeJS.ProcessEnv);
        expect(feature.features?.social?.friends?.enabled).toBe(false);
    });

    it("treats friends as disabled when username identity is disabled and the required identity provider is not registered", () => {
        const feature = resolveFriendsFeature({
            KAIWU_FEATURE_SOCIAL_FRIENDS__ENABLED: "1",
            KAIWU_FEATURE_SOCIAL_FRIENDS__ALLOW_USERNAME: "0",
            KAIWU_FEATURE_SOCIAL_FRIENDS__IDENTITY_PROVIDER: "custom",
        } as unknown as NodeJS.ProcessEnv);
        expect(feature.features?.social?.friends?.enabled).toBe(false);
    });
});
