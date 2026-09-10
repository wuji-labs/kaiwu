import { z } from 'zod';
export const DaemonTerminalErrorCodeSchema = z.enum([
    'terminal_disabled',
    'terminal_not_found',
    'terminal_cwd_denied',
    'terminal_spawn_failed',
    'terminal_invalid_request',
    'terminal_busy',
    'terminal_resize_unavailable',
]);
export const DaemonTerminalErrorSchema = z.object({
    ok: z.literal(false),
    errorCode: DaemonTerminalErrorCodeSchema,
    error: z.string().min(1),
}).passthrough();
export const DaemonTerminalLaunchIntentSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('session_attach'),
        sessionId: z.string().trim().min(1).max(512),
    }),
]);
function buildDaemonTerminalLaunchRequestSchema() {
    return z.object({
        terminalKey: z.string().min(1).max(2000).optional(),
        cwd: z.string().min(1).max(10_000).optional(),
        cols: z.number().int().min(2).max(500).optional(),
        rows: z.number().int().min(2).max(500).optional(),
        initialCommand: z.string().max(100_000).optional(),
        launch: DaemonTerminalLaunchIntentSchema.optional(),
    }).passthrough().superRefine((value, ctx) => {
        if (!value.terminalKey && !value.launch) {
            ctx.addIssue({ code: 'custom', path: ['terminalKey'], message: 'terminalKey or launch is required' });
        }
        if (value.launch && value.initialCommand !== undefined) {
            ctx.addIssue({ code: 'custom', path: ['initialCommand'], message: 'initialCommand cannot be combined with launch' });
        }
    });
}
export const DaemonTerminalEnsureRequestSchema = buildDaemonTerminalLaunchRequestSchema();
export const DaemonTerminalEnsureResponseSchema = z.union([
    z.object({
        ok: z.literal(true),
        terminalId: z.string().min(1),
        reused: z.boolean(),
    }).passthrough(),
    DaemonTerminalErrorSchema,
]);
export const DaemonTerminalStreamReadRequestSchema = z.object({
    terminalId: z.string().min(1),
    cursor: z.number().int().min(0),
    maxBytes: z.number().int().min(1).max(1024 * 1024).optional(),
    maxEvents: z.number().int().min(1).max(2048).optional(),
}).passthrough();
export const DaemonTerminalStreamEventDataSchema = z.object({
    t: z.literal('data'),
    data: z.string(),
}).passthrough();
export const DaemonTerminalStreamEventUrlSchema = z.object({
    t: z.literal('url'),
    url: z.string().url(),
    kind: z.enum(['auth', 'generic']),
    suggestOpen: z.boolean().optional(),
}).passthrough();
export const DaemonTerminalStreamEventGapSchema = z.object({
    t: z.literal('gap'),
    droppedBefore: z.number().int().min(0),
}).passthrough();
export const DaemonTerminalStreamEventExitSchema = z.object({
    t: z.literal('exit'),
    exitCode: z.number().int().nullable(),
    signal: z.number().int().nullable(),
}).passthrough();
export const DaemonTerminalStreamEventSchema = z.discriminatedUnion('t', [
    DaemonTerminalStreamEventDataSchema,
    DaemonTerminalStreamEventUrlSchema,
    DaemonTerminalStreamEventGapSchema,
    DaemonTerminalStreamEventExitSchema,
]);
export const DaemonTerminalStreamReadResponseSchema = z.union([
    z.object({
        ok: z.literal(true),
        terminalId: z.string().min(1),
        events: z.array(DaemonTerminalStreamEventSchema),
        nextCursor: z.number().int().min(0),
        done: z.boolean(),
    }).passthrough(),
    DaemonTerminalErrorSchema,
]);
export const DaemonTerminalInputRequestSchema = z.object({
    terminalId: z.string().min(1),
    data: z.string(),
}).passthrough();
export const DaemonTerminalInputResponseSchema = z.union([
    z.object({ ok: z.literal(true) }).passthrough(),
    DaemonTerminalErrorSchema,
]);
export const DaemonTerminalResizeRequestSchema = z.object({
    terminalId: z.string().min(1),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(500),
}).passthrough();
export const DaemonTerminalResizeResponseSchema = z.union([
    z.object({ ok: z.literal(true) }).passthrough(),
    DaemonTerminalErrorSchema,
]);
export const DaemonTerminalCloseRequestSchema = z.object({
    terminalId: z.string().min(1),
}).passthrough();
export const DaemonTerminalCloseResponseSchema = z.union([
    z.object({ ok: z.literal(true) }).passthrough(),
    DaemonTerminalErrorSchema,
]);
export const DaemonTerminalRestartRequestSchema = buildDaemonTerminalLaunchRequestSchema();
export const DaemonTerminalRestartResponseSchema = DaemonTerminalEnsureResponseSchema;
//# sourceMappingURL=daemonTerminal.js.map