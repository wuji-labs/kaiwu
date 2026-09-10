import { z } from 'zod';
export const CodexAppServerTextTurnInputSchema = z
    .object({
    type: z.literal('text'),
    text: z.string(),
    textElements: z.array(z.unknown()).optional(),
})
    .passthrough();
export const CodexAppServerImageTurnInputSchema = z
    .object({
    type: z.literal('image'),
    url: z.string().min(1),
})
    .passthrough();
export const CodexAppServerLocalImageTurnInputSchema = z
    .object({
    type: z.literal('localImage'),
    path: z.string().min(1),
})
    .passthrough();
export const CodexAppServerSkillTurnInputSchema = z
    .object({
    type: z.literal('skill'),
    name: z.string().min(1),
    path: z.string().min(1),
})
    .passthrough();
export const CodexAppServerMentionTurnInputSchema = z
    .object({
    type: z.literal('mention'),
    name: z.string().min(1),
    path: z.string().min(1).startsWith('plugin://'),
})
    .passthrough();
export const CodexAppServerTurnInputItemSchema = z.discriminatedUnion('type', [
    CodexAppServerTextTurnInputSchema,
    CodexAppServerImageTurnInputSchema,
    CodexAppServerLocalImageTurnInputSchema,
    CodexAppServerSkillTurnInputSchema,
    CodexAppServerMentionTurnInputSchema,
]);
export const CodexAppServerTurnInputSchema = z.array(CodexAppServerTurnInputItemSchema);
//# sourceMappingURL=appServerTurnInput.js.map