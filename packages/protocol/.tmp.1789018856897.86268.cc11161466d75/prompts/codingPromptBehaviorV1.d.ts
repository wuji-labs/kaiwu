import { z } from 'zod';
export declare const CodingPromptBehaviorModeV1Schema: any;
export type CodingPromptBehaviorModeV1 = z.infer<typeof CodingPromptBehaviorModeV1Schema>;
export declare const CodingPromptSessionTitleUpdatesModeV1Schema: any;
export type CodingPromptSessionTitleUpdatesModeV1 = z.infer<typeof CodingPromptSessionTitleUpdatesModeV1Schema>;
export declare const CodingPromptBehaviorV1Schema: any;
export type CodingPromptBehaviorV1 = z.infer<typeof CodingPromptBehaviorV1Schema>;
export declare const DEFAULT_CODING_PROMPT_BEHAVIOR_V1: CodingPromptBehaviorV1;
export declare function resolveCodingPromptBehaviorV1(settingsLike: unknown): CodingPromptBehaviorV1;
export declare function resolveCodingPromptSessionTitleUpdatesModeV1(settingsLike: unknown): CodingPromptSessionTitleUpdatesModeV1;
export declare function isCodingPromptSessionTitleUpdatesEnabled(settingsLike: unknown): boolean;
export declare function isCodingPromptResponseOptionsEnabled(settingsLike: unknown): boolean;
export declare const CodingPromptBehaviorOverrideV1Schema: any;
export type CodingPromptBehaviorOverrideV1 = z.infer<typeof CodingPromptBehaviorOverrideV1Schema>;
export declare function resolveCodingPromptBehaviorV1WithOverride(params: {
    settingsLike: unknown;
    override?: CodingPromptBehaviorOverrideV1 | null;
}): CodingPromptBehaviorV1;
export declare function applyCodingPromptBehaviorOverrideToSettings(params: {
    settings: Readonly<Record<string, unknown>> | null | undefined;
    override?: CodingPromptBehaviorOverrideV1 | null;
}): Record<string, unknown>;
//# sourceMappingURL=codingPromptBehaviorV1.d.ts.map