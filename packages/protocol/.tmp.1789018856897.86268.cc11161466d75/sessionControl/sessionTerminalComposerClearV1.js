import { z } from 'zod';
export const SessionTerminalComposerClearRequestV1Schema = z
    .object({
    sessionId: z.string().trim().min(1),
    expectedStateAtMs: z.number().int().nonnegative().optional(),
})
    .passthrough();
export const SessionTerminalComposerClearSuccessStatusV1Schema = z.enum([
    'cleared',
    'already_empty',
]);
export const SessionTerminalComposerClearFailureStatusV1Schema = z.enum([
    'unsupported',
    'no_live_terminal',
    'not_safe',
    'generating',
    'dialog_open',
    'capture_unavailable',
    'clear_failed',
    'host_dead',
]);
export const SessionTerminalComposerClearResultV1Schema = z.discriminatedUnion('ok', [
    z
        .object({
        ok: z.literal(true),
        status: SessionTerminalComposerClearSuccessStatusV1Schema,
        sessionId: z.string().min(1).optional(),
    })
        .passthrough(),
    z
        .object({
        ok: z.literal(false),
        status: SessionTerminalComposerClearFailureStatusV1Schema,
        sessionId: z.string().min(1).optional(),
        errorCode: z.string().min(1).optional(),
        error: z.string().min(1).optional(),
    })
        .passthrough(),
]);
export function buildUnsupportedSessionTerminalComposerClearResult(sessionId, method) {
    return SessionTerminalComposerClearResultV1Schema.parse({
        ok: false,
        status: 'unsupported',
        sessionId,
        errorCode: 'unsupported_session_runtime_method',
        error: `unsupported_session_runtime_method:${method}`,
    });
}
//# sourceMappingURL=sessionTerminalComposerClearV1.js.map