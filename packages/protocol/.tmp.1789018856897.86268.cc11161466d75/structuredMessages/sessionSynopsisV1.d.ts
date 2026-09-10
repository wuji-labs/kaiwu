import { z } from 'zod';
/**
 * Structured meta payload for a rolling "session so far" synopsis.
 *
 * Emitted under `meta.happier.kind='session_synopsis.v1'`.
 *
 * This is intentionally short and frequently updated so UIs and agents can quickly
 * understand session context without fetching large transcript windows.
 */
export declare const SessionSynopsisV1Schema: any;
export type SessionSynopsisV1 = z.infer<typeof SessionSynopsisV1Schema>;
//# sourceMappingURL=sessionSynopsisV1.d.ts.map