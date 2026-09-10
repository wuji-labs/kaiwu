import { z } from 'zod';
export const ActionInputPathSchema = z.string().min(1);
export const ActionInputPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const ActionInputPredicateSchema = z.lazy(() => z.union([
    z
        .object({
        op: z.literal('truthy'),
        path: ActionInputPathSchema,
    })
        .strict(),
    z
        .object({
        op: z.literal('eq'),
        path: ActionInputPathSchema,
        value: ActionInputPrimitiveSchema,
    })
        .strict(),
    z
        .object({
        op: z.literal('includes'),
        path: ActionInputPathSchema,
        value: z.string().min(1),
    })
        .strict(),
    z
        .object({
        op: z.literal('not'),
        predicate: ActionInputPredicateSchema,
    })
        .strict(),
    z
        .object({
        op: z.literal('and'),
        all: z.array(ActionInputPredicateSchema).min(1),
    })
        .strict(),
    z
        .object({
        op: z.literal('or'),
        any: z.array(ActionInputPredicateSchema).min(1),
    })
        .strict(),
]));
function getValueAtPath(input, path) {
    const obj = input && typeof input === 'object' ? input : null;
    if (!obj)
        return undefined;
    const parts = String(path ?? '')
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (!cur || typeof cur !== 'object')
            return undefined;
        cur = cur[p];
    }
    return cur;
}
export function evaluateActionInputPredicate(predicate, input) {
    if (!predicate || typeof predicate !== 'object')
        return false;
    const op = predicate.op;
    if (op === 'truthy') {
        const v = getValueAtPath(input, String(predicate.path ?? ''));
        return Boolean(v);
    }
    if (op === 'eq') {
        const v = getValueAtPath(input, String(predicate.path ?? ''));
        return v === predicate.value;
    }
    if (op === 'includes') {
        const v = getValueAtPath(input, String(predicate.path ?? ''));
        if (Array.isArray(v))
            return v.map((x) => String(x ?? '').trim()).includes(String(predicate.value ?? '').trim());
        if (typeof v === 'string')
            return v.includes(String(predicate.value ?? ''));
        return false;
    }
    if (op === 'not') {
        return !evaluateActionInputPredicate(predicate.predicate, input);
    }
    if (op === 'and') {
        const all = Array.isArray(predicate.all) ? predicate.all : [];
        return all.every((p) => evaluateActionInputPredicate(p, input));
    }
    if (op === 'or') {
        const any = Array.isArray(predicate.any) ? predicate.any : [];
        return any.some((p) => evaluateActionInputPredicate(p, input));
    }
    return false;
}
//# sourceMappingURL=actionInputPredicates.js.map