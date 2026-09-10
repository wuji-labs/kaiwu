/**
 * Shared settlement loop for the accept-then-async spawn contract.
 *
 * A spawn request may be accepted before the spawned session's webhook lands;
 * the daemon then exposes the pending spawn through a nonce resolver
 * (`/spawn-session/resolve` / `resolveSpawnSessionByNonce`). Every consumer
 * that needs the spawned session id (fork, scripted session creation, UI spawn
 * recovery) must poll that resolver with the SAME semantics — this module is
 * the single owner of those semantics so timeouts, `not_found` handling, and
 * poll behavior cannot drift between consumers.
 */
import type { SpawnSessionErrorCode, SpawnSessionErrorDetail } from './spawnSession.js';
export type SpawnSessionNonceResolution = {
    status: 'success';
    sessionId: string;
} | {
    status: 'error';
    errorCode: SpawnSessionErrorCode;
    errorMessage: string;
    errorDetail?: SpawnSessionErrorDetail;
} | {
    status: 'pending';
} | {
    status: 'not_found';
} | {
    status: 'unsupported';
};
export type SettleSpawnSessionNonceResult = {
    status: 'success';
    sessionId: string;
} | {
    status: 'error';
    errorCode: SpawnSessionErrorCode;
    errorMessage: string;
    errorDetail?: SpawnSessionErrorDetail;
}
/** Deadline elapsed while the spawn was still tracked (slow webhook). */
 | {
    status: 'timeout';
}
/**
 * The nonce stayed untracked beyond the grace window: the spawn was never
 * accepted here, was pruned, or the child died before registering. Consumers
 * should fail fast instead of waiting out the full timeout.
 */
 | {
    status: 'not_found';
} | {
    status: 'unsupported';
};
export declare function settleSpawnSessionNonce(params: Readonly<{
    spawnNonce: string;
    resolve: (spawnNonce: string, remainingTimeoutMs?: number) => Promise<SpawnSessionNonceResolution>;
    /** `null` keeps provider-owned lifecycle settlement under its own custody. */
    timeoutMs: number | null;
    pollIntervalMs: number;
    /**
     * How long a run of consecutive `not_found` resolutions is tolerated before
     * settling as `not_found`. A `pending`/`success` resolution resets the window.
     */
    notFoundGraceMs?: number | null;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    signal?: AbortSignal;
}>): Promise<SettleSpawnSessionNonceResult>;
//# sourceMappingURL=spawnSessionNonce.d.ts.map