import { z } from 'zod';
export const CodingPromptBehaviorModeV1Schema = z.enum(['agent', 'disabled']);
export const CodingPromptSessionTitleUpdatesModeV1Schema = z.enum(['disabled', 'initial', 'ongoing']);
const CodingPromptSessionTitleUpdatesInputV1Schema = z
    .enum(['agent', 'disabled', 'initial', 'ongoing'])
    .transform((mode) => (mode === 'agent' ? 'ongoing' : mode));
export const CodingPromptBehaviorV1Schema = z
    .object({
    v: z.literal(1).default(1),
    sessionTitleUpdates: CodingPromptSessionTitleUpdatesInputV1Schema.default('ongoing'),
    responseOptions: CodingPromptBehaviorModeV1Schema.default('agent'),
})
    .catch({
    v: 1,
    sessionTitleUpdates: 'ongoing',
    responseOptions: 'agent',
});
export const DEFAULT_CODING_PROMPT_BEHAVIOR_V1 = Object.freeze(CodingPromptBehaviorV1Schema.parse({}));
export function resolveCodingPromptBehaviorV1(settingsLike) {
    const rec = settingsLike && typeof settingsLike === 'object' && !Array.isArray(settingsLike)
        ? settingsLike
        : null;
    return CodingPromptBehaviorV1Schema.parse(rec?.codingPromptBehaviorV1);
}
export function resolveCodingPromptSessionTitleUpdatesModeV1(settingsLike) {
    return resolveCodingPromptBehaviorV1(settingsLike).sessionTitleUpdates;
}
export function isCodingPromptSessionTitleUpdatesEnabled(settingsLike) {
    return resolveCodingPromptSessionTitleUpdatesModeV1(settingsLike) !== 'disabled';
}
export function isCodingPromptResponseOptionsEnabled(settingsLike) {
    return resolveCodingPromptBehaviorV1(settingsLike).responseOptions === 'agent';
}
// Override schema for per-profile overrides (partial, no field defaults)
export const CodingPromptBehaviorOverrideV1Schema = z.object({
    v: z.literal(1).default(1),
    sessionTitleUpdates: CodingPromptSessionTitleUpdatesInputV1Schema.optional(),
    responseOptions: CodingPromptBehaviorModeV1Schema.optional(),
}).catch({ v: 1 });
// Merge resolver: global defaults; override fields win when set; v from global
export function resolveCodingPromptBehaviorV1WithOverride(params) {
    const global = resolveCodingPromptBehaviorV1(params.settingsLike);
    if (!params.override) {
        return global;
    }
    // Override is an object (could be minimal from .catch({ v: 1 }))
    const overrideObj = params.override;
    // Build merged result: v always from global, other fields use override if set
    return {
        v: global.v,
        sessionTitleUpdates: (overrideObj?.sessionTitleUpdates ?? global.sessionTitleUpdates),
        responseOptions: (overrideObj?.responseOptions ?? global.responseOptions),
    };
}
// Settings-record helper: returns { ...settings, codingPromptBehaviorV1: <resolved full object> }
export function applyCodingPromptBehaviorOverrideToSettings(params) {
    if (!params.override) {
        // No override => settings unchanged reference
        return params.settings ?? {};
    }
    const resolved = resolveCodingPromptBehaviorV1WithOverride({
        settingsLike: params.settings,
        override: params.override,
    });
    return { ...params.settings, codingPromptBehaviorV1: resolved };
}
//# sourceMappingURL=codingPromptBehaviorV1.js.map