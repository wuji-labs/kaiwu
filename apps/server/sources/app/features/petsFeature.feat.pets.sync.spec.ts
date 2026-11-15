import { describe, expect, it } from "vitest";

import { BUILT_IN_PET_IDS_V1, PET_SYNC_SUPPORTED_MEDIA_TYPES_V1 } from "@happier-dev/protocol";

import { resolveFeaturesFromEnv } from "./registry";

describe("features/petsFeature", () => {
    it("defaults removed pets gates to disabled", () => {
        const result = resolveFeaturesFromEnv({} as NodeJS.ProcessEnv);

        expect(result.features?.pets?.companion?.enabled).toBe(false);
    });

    it("ignores removed pets env opt-ins", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_FEATURE_PETS_COMPANION__ENABLED: "0",
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
        } as NodeJS.ProcessEnv);

        expect(result.features?.pets?.companion?.enabled).toBe(false);
        expect(result.features?.pets?.sync?.enabled).toBe(false);
    });

    it("keeps pets.sync disabled when env requests it", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
        } as NodeJS.ProcessEnv);

        expect(result.features?.pets?.companion?.enabled).toBe(false);
        expect(result.features?.pets?.sync?.enabled).toBe(false);
    });

    it("keeps pets gates disabled when companion is build-policy denied", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_BUILD_FEATURES_DENY: "pets.companion",
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
        } as NodeJS.ProcessEnv);

        expect(result.features?.pets?.companion?.enabled).toBe(false);
        expect(result.features?.pets?.sync?.enabled).toBe(false);
    });

    it("surfaces bounded pets import limits as capabilities without using them as gates", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
            KAIWU_FEATURE_PETS_SYNC__MAX_MANIFEST_BYTES: "16384",
            KAIWU_FEATURE_PETS_SYNC__MAX_CANONICAL_SPRITESHEET_BYTES: "5242880",
            KAIWU_FEATURE_PETS_SYNC__MAX_CANONICAL_PACKAGE_BYTES: "6291456",
            KAIWU_FEATURE_PETS_SYNC__MAX_IMPORTED_PETS_PER_ACCOUNT: "20",
            KAIWU_FEATURE_PETS_SYNC__MAX_IMPORTED_PET_BYTES_PER_ACCOUNT: "104857600",
        } as NodeJS.ProcessEnv);

        expect(result.capabilities?.pets?.limits).toEqual(expect.objectContaining({
            maxManifestBytes: 16_384,
            maxCanonicalSpritesheetBytes: 5_242_880,
            maxCanonicalPackageBytes: 6_291_456,
            maxImportedPetsPerAccount: 20,
            maxImportedPetBytesPerAccount: 104_857_600,
        }));
    });

    it("surfaces companion and conservative sync capability details without using them as gates", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
        } as NodeJS.ProcessEnv);

        expect(result.features?.pets?.sync?.enabled).toBe(false);
        expect(result.capabilities?.pets?.companion).toEqual({
            builtInPetIds: [...BUILT_IN_PET_IDS_V1],
        });
        expect(result.capabilities?.pets?.sync).toEqual(expect.objectContaining({
            supportedMediaTypes: [...PET_SYNC_SUPPORTED_MEDIA_TYPES_V1],
            encryptedCustomPetSyncPolicy: "disabled",
            maxManifestBytes: expect.any(Number),
            maxCanonicalSpritesheetBytes: expect.any(Number),
            maxCanonicalPackageBytes: expect.any(Number),
            maxPreCanonicalImportBytes: expect.any(Number),
            maxImportedPetsPerAccount: expect.any(Number),
            maxImportedPetBytesPerAccount: expect.any(Number),
            maxImportedPetsPerDevice: expect.any(Number),
            maxImportedPetBytesPerDevice: expect.any(Number),
        }));
    });

    it("publishes the configured encrypted custom pet sync policy in sync capabilities", () => {
        const result = resolveFeaturesFromEnv({
            KAIWU_FEATURE_PETS_SYNC__ENABLED: "1",
            KAIWU_FEATURE_PETS_SYNC__ENCRYPTED_CUSTOM_PET_SYNC_POLICY: "allowedWithClientValidation",
        } as NodeJS.ProcessEnv);

        expect(result.features?.pets?.sync?.enabled).toBe(false);
        expect(result.capabilities?.pets?.sync?.encryptedCustomPetSyncPolicy).toBe("allowedWithClientValidation");
    });
});
