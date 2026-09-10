import { z } from 'zod';
export declare const ActionInputPathSchema: any;
export type ActionInputPath = z.infer<typeof ActionInputPathSchema>;
export declare const ActionInputPrimitiveSchema: any;
export type ActionInputPrimitive = z.infer<typeof ActionInputPrimitiveSchema>;
export declare const ActionInputPredicateSchema: z.ZodType<any>;
export type ActionInputPredicate = z.infer<typeof ActionInputPredicateSchema>;
export declare function evaluateActionInputPredicate(predicate: ActionInputPredicate, input: unknown): boolean;
//# sourceMappingURL=actionInputPredicates.d.ts.map