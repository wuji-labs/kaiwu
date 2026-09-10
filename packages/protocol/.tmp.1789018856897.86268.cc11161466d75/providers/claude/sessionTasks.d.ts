import { z } from 'zod';
import type { SessionWorkStateItemV1 } from '../../sessionWorkState/sessionWorkStateV1.js';
export declare const ClaudeTaskEventSchema: any;
export type ClaudeTaskEvent = z.infer<typeof ClaudeTaskEventSchema>;
export declare const ClaudeTodoWriteTodoSchema: any;
export type ClaudeTodoWriteTodo = z.infer<typeof ClaudeTodoWriteTodoSchema>;
export declare const ClaudeTaskToolInputSchema: any;
export type ClaudeTaskToolInput = z.infer<typeof ClaudeTaskToolInputSchema>;
export declare const ClaudeTaskToolRecordSchema: any;
export type ClaudeTaskToolRecord = z.infer<typeof ClaudeTaskToolRecordSchema>;
/**
 * Neutral 7-value Claude activity status. This is the canonical vocabulary every Claude-owned
 * surface (work-state task/todo rows AND workflow run/agent snapshots) projects from, so status
 * normalization can never drift across them. Mirrors `SessionWorkflowAgentStatusV1`.
 */
export type ClaudeActivityStatusSignal = 'pending' | 'active' | 'complete' | 'failed' | 'blocked' | 'cancelled' | 'unknown';
/**
 * The single source of truth for Claude task/subagent/progress status normalization.
 *
 * Accepts the full Claude activity vocabulary across task lifecycle events, Task API tool status,
 * and Dynamic Workflow `workflow_agent.state` values (`done`/`running`/`progress`/...). Both the
 * work-state task mapper (`normalizeClaudeTaskStatus`, which projects `failed` -> `blocked` because
 * work-state has no `failed`) and the CWF2 workflow normalizer delegate here. Do NOT add a parallel
 * status table elsewhere.
 */
export declare function normalizeClaudeActivityStatusSignal(status: unknown, type?: string): ClaudeActivityStatusSignal;
export declare function normalizeClaudeAgentSdkProviderTaskId(taskId: unknown): string | null;
export declare function normalizeClaudeAgentSdkProviderTaskStatus(status: unknown): string | null;
export declare function readClaudeAgentSdkProviderTaskStatus(message: unknown): string | null;
export declare function isTerminalClaudeAgentSdkProviderTaskStatus(status: unknown): boolean;
/**
 * Does this tool result merely acknowledge that a subagent was launched?
 *
 * The ONE reader for that question, because two packages must agree on it or the roster tells two
 * stories: the CLI's workflow correlation must not terminalize an agent at launch, and the UI's
 * transcript derivation must not draw a live agent as finished. Both see the same provider fact
 * through different envelopes, so the unwrapping lives here too — the transcript normalizer
 * JSON-encodes the raw `toolUseResult` into a string, while the SDK log converter nests the same
 * object under `tool_use_result`.
 *
 * Tolerant by construction: this shape is undocumented provider internals, so anything unrecognised
 * answers `false` (the pre-existing reading) rather than throwing or reclassifying a real result.
 */
export declare function isClaudeAsyncAgentLaunchToolResult(value: unknown): boolean;
export declare function normalizeClaudeTaskEventToWorkStateItem(params: Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    event: unknown;
}>): SessionWorkStateItemV1 | null;
export declare function normalizeClaudeTaskToolUseToWorkStateItem(params: Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    toolName: unknown;
    toolUseId?: unknown;
    input: unknown;
}>): SessionWorkStateItemV1 | null;
export declare function normalizeClaudeTaskToolRecordsToWorkStateItems(params: Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    tasks: unknown;
}>): SessionWorkStateItemV1[];
export declare function normalizeClaudeTodoWriteTodosToWorkStateItems(params: Readonly<{
    backendId: string;
    agentId?: string;
    updatedAt: number;
    todos: unknown;
}>): SessionWorkStateItemV1[];
//# sourceMappingURL=sessionTasks.d.ts.map