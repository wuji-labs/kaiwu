import { z } from 'zod';
/**
 * Structured meta payload for an encrypted summary shard covering a transcript seq window.
 *
 * Emitted under `meta.happier.kind='session_summary_shard.v1'`.
 *
 * This payload is intentionally self-contained so the daemon can rebuild local indexes
 * from transcript history without re-running the summarizer.
 */
export declare const SessionSummaryShardV1Schema: any;
export type SessionSummaryShardV1 = z.infer<typeof SessionSummaryShardV1Schema>;
//# sourceMappingURL=sessionSummaryShardV1.d.ts.map