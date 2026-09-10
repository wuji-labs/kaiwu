import { z } from 'zod';
/**
 * Canonical, cross-surface input contract for starting reviews.
 *
 * This is not a “backend contract”. It is a generalized review intent input that
 * can be interpreted by different review engines (LLM prompt reviews, native CLIs).
 */
export const ReviewChangeTypeSchema = z.enum(['all', 'committed', 'uncommitted']);
export const ReviewBaseSchema = z.union([
    z.object({ kind: z.literal('none') }).passthrough(),
    z.object({ kind: z.literal('branch'), baseBranch: z.string().min(1) }).passthrough(),
    z.object({ kind: z.literal('commit'), baseCommit: z.string().min(1) }).passthrough(),
]);
export const ReviewEngineIdSchema = z.string().trim().min(1);
export const ReviewRunLocationSchema = z.enum(['execution_run', 'current_session']);
export const CodeRabbitReviewEngineInputSchema = z
    .object({
    configFiles: z.array(z.string().min(1)).optional(),
    plain: z.boolean().optional(),
    promptOnly: z.boolean().optional(),
    maxFiles: z.number().int().min(1).max(5000).optional(),
})
    .strict();
const DEFAULT_CODERABBIT_REVIEW_ENGINE_INPUT = CodeRabbitReviewEngineInputSchema.parse({});
export const ReviewEngineInputsSchema = z
    .object({
    // Default to `{}` so surfaces don't need to inject an "empty config" object
    // just to satisfy schema validation when the engine is selected.
    coderabbit: CodeRabbitReviewEngineInputSchema.optional().default(DEFAULT_CODERABBIT_REVIEW_ENGINE_INPUT),
})
    .passthrough();
const DEFAULT_REVIEW_ENGINE_INPUTS = ReviewEngineInputsSchema.parse({});
export const ReviewStartInputSchema = z
    .object({
    sessionId: z.string().min(1).optional(),
    engineIds: z.array(ReviewEngineIdSchema).min(1),
    instructions: z.string().trim().default(''),
    runLocation: ReviewRunLocationSchema.default('execution_run'),
    // Intentionally default to uncommitted changes: the common "review what I just changed"
    // flow should stay narrowly scoped unless the user explicitly broadens it.
    changeType: ReviewChangeTypeSchema.default('uncommitted'),
    base: ReviewBaseSchema.default({ kind: 'none' }),
    engines: ReviewEngineInputsSchema.prefault(DEFAULT_REVIEW_ENGINE_INPUTS),
    permissionMode: z.string().min(1).default('read_only'),
})
    .passthrough();
//# sourceMappingURL=reviewStart.js.map