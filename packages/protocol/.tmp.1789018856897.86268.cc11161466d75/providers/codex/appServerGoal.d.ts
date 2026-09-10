import { z } from 'zod';
import type { SessionWorkStateItemV1 } from '../../sessionWorkState/sessionWorkStateV1.js';
export declare const CodexAppServerGoalStatusSchema: any;
export type CodexAppServerGoalStatus = z.infer<typeof CodexAppServerGoalStatusSchema>;
export declare const CodexAppServerGoalSchema: any;
export type CodexAppServerGoal = z.infer<typeof CodexAppServerGoalSchema>;
export declare function normalizeCodexAppServerGoalToSessionWorkStateItem(params: Readonly<{
    backendId: string;
    agentId?: string;
    goal: unknown;
}>): SessionWorkStateItemV1 | null;
//# sourceMappingURL=appServerGoal.d.ts.map