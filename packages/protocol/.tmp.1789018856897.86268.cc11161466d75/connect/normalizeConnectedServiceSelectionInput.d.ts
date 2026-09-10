import { type ConnectedServiceBindingsV1, type ConnectedServiceId } from './connectedServiceBindings.js';
/**
 * Agent-friendly connected-services selection normalizer — the ONE boundary that turns the simple
 * forms an agent naturally reaches for into a canonical {@link ConnectedServiceBindingsV1}.
 *
 * Accepted input (any of):
 *  - `undefined` / `null` → no explicit selection; the run/session uses the account default.
 *  - a string token, or an array of string tokens, each one of:
 *      - `"<serviceId>"`                     → the NAMED service's account default. This is an
 *                                              explicit per-service intent: it is REPRESENTED in
 *                                              {@link NormalizeConnectedServiceSelectionResult.defaultServiceIds},
 *                                              never silently dropped. Resolving it to a concrete
 *                                              binding requires account settings, so it happens in a
 *                                              settings-aware consumer (see the run-start policy below).
 *      - `"<serviceId>:<profileId>"`         → pin the run to that connected profile. `profileId` may
 *                                              itself contain `:` (e.g. `work:us`); the entire suffix
 *                                              after the service prefix is preserved.
 *      - `"<serviceId>:profile:<profileId>"` → pin the run to that connected profile (explicit).
 *      - `"<serviceId>:group:<groupId>"`     → bind to that account pool/group (auto-rotates when the
 *                                              pool has autoSwitch enabled). Group ids are strict and
 *                                              never contain `:`.
 *      - `"<serviceId>:native"`              → opt out; use the runner's inherited account.
 *  - a full `{ v: 1, bindingsByServiceId: { ... } }` object (the canonical power form).
 *
 * Malformed input is rejected with a typed error naming the valid forms — never silently dropped.
 * The result carries `bindings` (explicit pins) alongside `defaultServiceIds` (services asking for
 * their stored account default). The three previously-conflated states — "no selection supplied",
 * "a named service wants its account default", and "no explicit binding" — are now distinct.
 */
export type NormalizeConnectedServiceSelectionResult = Readonly<{
    ok: true;
    bindings: ConnectedServiceBindingsV1 | undefined;
    /** Services whose bare token requested their stored account default (explicit per-service intent). */
    defaultServiceIds: readonly ConnectedServiceId[];
}> | Readonly<{
    ok: false;
    error: string;
}>;
export type NormalizeConnectedServiceSelectionForRunStartResult = Readonly<{
    ok: true;
    bindings: ConnectedServiceBindingsV1 | undefined;
}> | Readonly<{
    ok: false;
    error: string;
}>;
export declare function normalizeConnectedServiceSelectionInput(input: unknown): NormalizeConnectedServiceSelectionResult;
/**
 * Boundary policy for run-start consumers (execution.run.start, subagents.delegate/plan, voice_agent.start,
 * the manual execution-run tool) that lack account settings and therefore cannot resolve a per-service
 * default to a concrete binding at this layer.
 *
 * - Explicit-only or empty selections pass through unchanged.
 * - A PURE per-service-default selection (bare tokens only) yields `bindings: undefined`, deferring to
 *   the downstream, settings-aware account-defaulting owner (the documented "account default" contract).
 * - A MIXED selection (a bare default token alongside explicit pins for other services) FAILS CLOSED:
 *   honoring the bare service's account default here would require a per-service default merge that this
 *   settings-less boundary cannot perform, and silently dropping it selected the wrong account (RO-F5).
 *   The caller is told to omit the field for all-defaults or to pin every service explicitly.
 */
export declare function normalizeConnectedServiceSelectionForRunStart(input: unknown): NormalizeConnectedServiceSelectionForRunStartResult;
//# sourceMappingURL=normalizeConnectedServiceSelectionInput.d.ts.map