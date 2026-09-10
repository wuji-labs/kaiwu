import { z } from 'zod';
import { SessionForkPointSchema, type SessionForkPoint } from './sessionForkPoint.js';
/**
 * The cutoff is owned by the zero-dependency `./sessionForkPoint.js` module, but
 * this stays its canonical import site so existing importers and the protocol
 * index entry are unchanged. One import, one re-export — no duplicate module
 * specifier for tooling to trip on.
 */
export { SessionForkPointSchema, type SessionForkPoint };
/**
 * `native` is the generic user intent: "fork natively, and do NOT silently fall
 * back to Replay". The lifecycle owner maps it onto its existing
 * provider-native / ACP-native attempts and returns the existing unsupported
 * result when no native path is usable; the UI does not reproduce that policy.
 *
 * `auto`, `provider_native`, and `acp_fork_latest` remain as compatibility and
 * diagnostic strategies for existing non-UI callers.
 *
 * Mixed-version note: this enum sits inside a `.strict()` params object, so a
 * daemon that predates `native` REJECTS the whole request rather than
 * downgrading it to `auto` and risking an unrequested Replay fork. Clients gate
 * the Native card locally, on `resolveSessionForkStrategyAvailability`, which is
 * strictly tighter than Agent capability alone: it also requires a usable fork
 * point and excludes Provider-bound Sessions, whose fork lifecycle refuses every
 * non-replay strategy.
 */
export declare const SessionForkStrategySchema: any;
export type SessionForkStrategy = z.infer<typeof SessionForkStrategySchema>;
export declare const SessionForkRpcParamsSchema: any;
export type SessionForkRpcParams = z.infer<typeof SessionForkRpcParamsSchema>;
export declare const SessionForkRpcResultSchema: any;
export type SessionForkRpcResult = z.infer<typeof SessionForkRpcResultSchema>;
//# sourceMappingURL=sessionFork.d.ts.map