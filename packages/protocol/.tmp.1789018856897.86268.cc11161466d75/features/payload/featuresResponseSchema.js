import { z } from 'zod';
import { CapabilitiesSchema } from './capabilities/capabilitiesSchema.js';
import { FeatureGatesSchema } from './featureGatesSchema.js';
import { isRecord } from './isRecord.js';
import { coerceBugReportsCapabilitiesFromFeaturesPayload } from './capabilities/bugReportsCapabilities.js';
function coerceFeaturesResponsePayload(raw) {
    if (!isRecord(raw))
        return raw;
    // Robustness: malformed bugReports capabilities must not invalidate unrelated feature gates.
    // Coerce it to a safe default while preserving the rest of the payload.
    const next = { ...raw };
    if (!isRecord(next.capabilities)) {
        next.capabilities = {};
    }
    return {
        ...next,
        capabilities: {
            ...next.capabilities,
            bugReports: coerceBugReportsCapabilitiesFromFeaturesPayload(next),
        },
    };
}
export const FeaturesResponseSchema = z.preprocess(coerceFeaturesResponsePayload, z.object({
    features: FeatureGatesSchema,
    capabilities: CapabilitiesSchema,
}));
//# sourceMappingURL=featuresResponseSchema.js.map