import { z } from 'zod';
/**
 * Canonical, cross-surface input contract for starting reviews.
 *
 * This is not a “backend contract”. It is a generalized review intent input that
 * can be interpreted by different review engines (LLM prompt reviews, native CLIs).
 */
export declare const ReviewChangeTypeSchema: any;
export type ReviewChangeType = z.infer<typeof ReviewChangeTypeSchema>;
export declare const ReviewBaseSchema: any;
export type ReviewBase = z.infer<typeof ReviewBaseSchema>;
export declare const ReviewEngineIdSchema: any;
export type ReviewEngineId = z.infer<typeof ReviewEngineIdSchema>;
export declare const ReviewRunLocationSchema: any;
export type ReviewRunLocation = z.infer<typeof ReviewRunLocationSchema>;
export declare const CodeRabbitReviewEngineInputSchema: any;
export type CodeRabbitReviewEngineInput = z.infer<typeof CodeRabbitReviewEngineInputSchema>;
export declare const ReviewEngineInputsSchema: any;
export type ReviewEngineInputs = z.infer<typeof ReviewEngineInputsSchema>;
export declare const ReviewStartInputSchema: any;
export type ReviewStartInput = z.infer<typeof ReviewStartInputSchema>;
//# sourceMappingURL=reviewStart.d.ts.map