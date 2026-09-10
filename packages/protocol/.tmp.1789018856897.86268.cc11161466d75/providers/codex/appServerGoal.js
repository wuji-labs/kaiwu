import { z } from 'zod';
import { buildVendorSessionWorkStateItemId } from '../../sessionWorkState/sessionWorkStateItemIds.js';
export const CodexAppServerGoalStatusSchema = z.enum([
    'active',
    'paused',
    'blocked',
    'usageLimited',
    'budgetLimited',
    'complete',
]);
export const CodexAppServerGoalSchema = z
    .object({
    threadId: z.string().min(1),
    objective: z.string().trim().min(1).max(4000),
    status: CodexAppServerGoalStatusSchema,
    tokenBudget: z.number().finite().positive().nullable().optional(),
    tokensUsed: z.number().int().nonnegative().optional(),
    timeUsedSeconds: z.number().finite().nonnegative().optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),
    updatedAt: z.union([z.string(), z.number()]),
})
    .passthrough();
function normalizeTimestampMs(value) {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000)
            return null;
        return value * 1_000;
    }
    if (typeof value !== 'string')
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function normalizeCodexGoalStatus(status) {
    if (status === 'blocked' || status === 'usageLimited' || status === 'budgetLimited')
        return 'blocked';
    if (status === 'complete')
        return 'complete';
    return status;
}
function normalizeCodexGoalStatusReason(status) {
    if (status === 'blocked' || status === 'usageLimited' || status === 'budgetLimited')
        return status;
    return undefined;
}
export function normalizeCodexAppServerGoalToSessionWorkStateItem(params) {
    const parsed = CodexAppServerGoalSchema.safeParse(params.goal);
    if (!parsed.success)
        return null;
    const updatedAt = normalizeTimestampMs(parsed.data.updatedAt);
    if (updatedAt === null)
        return null;
    const createdAt = normalizeTimestampMs(parsed.data.createdAt);
    if (parsed.data.createdAt !== undefined && createdAt === null)
        return null;
    const statusReason = normalizeCodexGoalStatusReason(parsed.data.status);
    return {
        id: buildVendorSessionWorkStateItemId('goal', parsed.data.threadId),
        kind: 'goal',
        origin: 'vendor',
        status: normalizeCodexGoalStatus(parsed.data.status),
        ...(statusReason ? { statusReason } : {}),
        title: parsed.data.objective.trim(),
        backendId: params.backendId,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        vendorRef: parsed.data.threadId,
        ...(Object.prototype.hasOwnProperty.call(parsed.data, 'tokenBudget') ? { tokenBudget: parsed.data.tokenBudget } : {}),
        ...(typeof parsed.data.tokensUsed === 'number' ? { tokensUsed: parsed.data.tokensUsed } : {}),
        ...(typeof parsed.data.timeUsedSeconds === 'number' ? { timeUsedSeconds: parsed.data.timeUsedSeconds } : {}),
        ...(createdAt !== null ? { createdAt } : {}),
        updatedAt,
    };
}
//# sourceMappingURL=appServerGoal.js.map