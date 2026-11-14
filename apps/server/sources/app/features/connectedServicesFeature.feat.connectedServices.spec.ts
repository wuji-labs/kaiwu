import { describe, expect, it } from "vitest";

import { resolveConnectedServicesFeature } from "./connectedServicesFeature";

describe("resolveConnectedServicesFeature", () => {
    it("defaults to connected services enabled (including quotas and account groups)", () => {
        const feature = resolveConnectedServicesFeature({} as NodeJS.ProcessEnv);

        expect(feature.features?.connectedServices).toEqual({
            enabled: true,
            quotas: { enabled: true },
            accountGroups: { enabled: true },
            accountFallback: { enabled: true },
        });
        expect(feature.capabilities?.connectedServices).toEqual({
            credentialDelete: { revisionGuard: true },
        });
    });

    it("reads child enablement independently from connected services enablement", () => {
        const feature = resolveConnectedServicesFeature({
            KAIWU_FEATURE_CONNECTED_SERVICES__ENABLED: "0",
            KAIWU_FEATURE_CONNECTED_SERVICES_QUOTAS__ENABLED: "1",
            KAIWU_FEATURE_CONNECTED_SERVICES_ACCOUNT_GROUPS__ENABLED: "1",
            KAIWU_FEATURE_CONNECTED_SERVICES_ACCOUNT_FALLBACK__ENABLED: "1",
        } as NodeJS.ProcessEnv);

        expect(feature.features?.connectedServices).toEqual({
            enabled: false,
            quotas: { enabled: true },
            accountGroups: { enabled: true },
            accountFallback: { enabled: true },
        });
    });

    it("reads disabled account group env values", () => {
        const feature = resolveConnectedServicesFeature({
            KAIWU_FEATURE_CONNECTED_SERVICES_ACCOUNT_GROUPS__ENABLED: "0",
            KAIWU_FEATURE_CONNECTED_SERVICES_ACCOUNT_FALLBACK__ENABLED: "0",
        } as NodeJS.ProcessEnv);

        expect(feature.features?.connectedServices).toEqual({
            enabled: true,
            quotas: { enabled: true },
            accountGroups: { enabled: false },
            accountFallback: { enabled: false },
        });
    });
});
