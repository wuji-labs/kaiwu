import { z } from 'zod';
export declare const VOICE_ACTIONS_BLOCK: {
    readonly startTag: "<voice_actions>";
    readonly endTag: "</voice_actions>";
};
export type VoiceAssistantAction = Readonly<{
    t: string;
    args: unknown;
}>;
export declare const VoiceAssistantActionSchema: z.ZodType<VoiceAssistantAction>;
export declare function extractVoiceActionsFromAssistantText(assistantTextRaw: string): Readonly<{
    assistantText: string;
    actions: VoiceAssistantAction[];
}>;
//# sourceMappingURL=voiceActions.d.ts.map