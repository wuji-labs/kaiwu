import { type Capabilities } from './capabilities/capabilitiesSchema.js';
import { type FeatureGates } from './featureGatesSchema.js';
export declare const FeaturesResponseSchema: any;
export type FeaturesResponse = Readonly<{
    features: FeatureGates;
    capabilities: Capabilities;
}>;
//# sourceMappingURL=featuresResponseSchema.d.ts.map