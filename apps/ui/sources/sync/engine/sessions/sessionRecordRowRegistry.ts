import type { V2SessionRecord } from '@happier-dev/protocol';

/**
 * The last server row (still ciphertext) each decoder saw per session, so the transcript cache
 * can persist a session shell that the session-by-id decoder can replay on a cold start. The
 * decoded store `Session` cannot serve: it holds plaintext and no data-key envelope.
 *
 * Bounded because the list decoder feeds it too: a session never re-decoded drops out first.
 * The bound only has to exceed the transcript cache's own record cap, which it does by a margin.
 */
const MAX_REMEMBERED_ROWS = 256;

const rowsBySessionId = new Map<string, V2SessionRecord>();

export function rememberSessionRecordRow(row: V2SessionRecord): void {
    const sessionId = String(row.id ?? '').trim();
    if (!sessionId) return;
    rowsBySessionId.delete(sessionId);
    rowsBySessionId.set(sessionId, row);
    if (rowsBySessionId.size > MAX_REMEMBERED_ROWS) {
        const oldest = rowsBySessionId.keys().next().value;
        if (oldest !== undefined) rowsBySessionId.delete(oldest);
    }
}

export function readSessionRecordRow(sessionId: string): V2SessionRecord | null {
    return rowsBySessionId.get(sessionId) ?? null;
}

/** Server/account switch: rows of the previous scope must not be persisted under the next one. */
export function clearSessionRecordRows(): void {
    rowsBySessionId.clear();
}
