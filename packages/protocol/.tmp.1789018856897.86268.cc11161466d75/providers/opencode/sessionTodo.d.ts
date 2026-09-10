import { z } from 'zod';
import type { SessionWorkStateItemV1 } from '../../sessionWorkState/sessionWorkStateV1.js';
export declare const OpenCodeSessionTodoStatusSchema: any;
export declare const OpenCodeSessionTodoSchema: any;
export type OpenCodeSessionTodo = z.infer<typeof OpenCodeSessionTodoSchema>;
export declare function normalizeOpenCodeSessionTodosToWorkStateItems(params: Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    todos: unknown;
}>): SessionWorkStateItemV1[];
//# sourceMappingURL=sessionTodo.d.ts.map