import { ConnectedServiceAuthGroupIdSchema, ConnectedServiceBindingsV1Schema, ConnectedServiceIdSchema, ConnectedServiceProfileIdSchema, } from './connectedServiceBindings.js';
const VALID_FORMS_MESSAGE = 'Valid forms: "<serviceId>" (account default), "<serviceId>:<profileId>", '
    + '"<serviceId>:profile:<profileId>", "<serviceId>:group:<groupId>", "<serviceId>:native", '
    + 'an array of those, or a full { v: 1, bindingsByServiceId: {...} } object. '
    + 'serviceId is e.g. "openai-codex".';
function invalid(reason) {
    return { ok: false, error: `${reason} ${VALID_FORMS_MESSAGE}` };
}
function parseSelectionToken(rawToken) {
    const token = rawToken.trim();
    if (!token)
        return invalid('Empty connected-services selection.');
    // Preserve the ENTIRE remaining suffix as the value: only the service prefix and an optional
    // recognised kind keyword are consumed. profileId legally contains ':' — group ids never do.
    const parts = token.split(':');
    const serviceIdRaw = (parts[0] ?? '').trim();
    const serviceParsed = ConnectedServiceIdSchema.safeParse(serviceIdRaw);
    if (!serviceParsed.success) {
        return invalid(`Unknown connected service id "${serviceIdRaw}".`);
    }
    const serviceId = serviceParsed.data;
    // "<serviceId>" → the named service's account default (explicit per-service intent).
    if (parts.length === 1) {
        return { ok: true, serviceId, variant: { kind: 'default' } };
    }
    const kindOrProfile = (parts[1] ?? '').trim();
    if (parts.length === 2) {
        if (kindOrProfile === 'native') {
            return { ok: true, serviceId, variant: { kind: 'binding', binding: { source: 'native' } } };
        }
        if (kindOrProfile === 'group')
            return invalid(`"${serviceId}:group" is missing a group id.`);
        if (kindOrProfile === 'profile')
            return invalid(`"${serviceId}:profile" is missing a profile id.`);
        // "<serviceId>:<profileId>"
        const profileParsed = ConnectedServiceProfileIdSchema.safeParse(kindOrProfile);
        if (!profileParsed.success)
            return invalid(`Invalid profile id "${kindOrProfile}".`);
        return {
            ok: true,
            serviceId,
            variant: { kind: 'binding', binding: { source: 'connected', selection: 'profile', profileId: profileParsed.data } },
        };
    }
    // parts.length >= 3
    if (kindOrProfile === 'group') {
        // Group ids are strict and never contain ':' — exactly one value segment is allowed.
        if (parts.length > 3)
            return invalid(`Invalid group id "${parts.slice(2).join(':')}" (group ids cannot contain ":").`);
        const groupValue = (parts[2] ?? '').trim();
        const groupParsed = ConnectedServiceAuthGroupIdSchema.safeParse(groupValue);
        if (!groupParsed.success)
            return invalid(`Invalid group id "${groupValue}".`);
        return {
            ok: true,
            serviceId,
            variant: { kind: 'binding', binding: { source: 'connected', selection: 'group', groupId: groupParsed.data } },
        };
    }
    // Either an explicit "<serviceId>:profile:<profileId>" or a colon-bearing shorthand
    // "<serviceId>:<profileId>" — in both cases the whole remaining suffix is the profile id.
    const profileValue = kindOrProfile === 'profile' ? parts.slice(2).join(':') : parts.slice(1).join(':');
    const profileParsed = ConnectedServiceProfileIdSchema.safeParse(profileValue);
    if (!profileParsed.success)
        return invalid(`Invalid profile id "${profileValue}".`);
    return {
        ok: true,
        serviceId,
        variant: { kind: 'binding', binding: { source: 'connected', selection: 'profile', profileId: profileParsed.data } },
    };
}
function normalizeTokens(tokens) {
    const bindingsByServiceId = {};
    const defaultServiceIds = [];
    const seen = new Set();
    for (const rawToken of tokens) {
        const parsed = parseSelectionToken(rawToken);
        if (!parsed.ok)
            return parsed;
        // Duplicate detection runs on the parsed selection BEFORE resolution, so a bare token and an
        // explicit token for the same service (any order) are rejected rather than silently merged.
        if (seen.has(parsed.serviceId)) {
            return invalid(`Duplicate selection for service "${parsed.serviceId}".`);
        }
        seen.add(parsed.serviceId);
        if (parsed.variant.kind === 'default') {
            defaultServiceIds.push(parsed.serviceId);
            continue;
        }
        bindingsByServiceId[parsed.serviceId] = parsed.variant.binding;
    }
    let bindings;
    if (Object.keys(bindingsByServiceId).length > 0) {
        const parsed = ConnectedServiceBindingsV1Schema.safeParse({ v: 1, bindingsByServiceId });
        if (!parsed.success)
            return invalid('Invalid connected-services selection.');
        bindings = parsed.data;
    }
    return { ok: true, bindings, defaultServiceIds };
}
export function normalizeConnectedServiceSelectionInput(input) {
    if (input === undefined || input === null) {
        return { ok: true, bindings: undefined, defaultServiceIds: [] };
    }
    if (typeof input === 'string') {
        return normalizeTokens([input]);
    }
    if (Array.isArray(input)) {
        if (input.some((entry) => typeof entry !== 'string')) {
            return invalid('Connected-services array entries must be strings.');
        }
        return normalizeTokens(input);
    }
    if (typeof input === 'object') {
        // Canonical power form: a full bindings object.
        const parsed = ConnectedServiceBindingsV1Schema.safeParse(input);
        if (parsed.success) {
            const hasBinding = Object.keys(parsed.data.bindingsByServiceId).length > 0;
            return { ok: true, bindings: hasBinding ? parsed.data : undefined, defaultServiceIds: [] };
        }
        return invalid('Invalid connected-services object.');
    }
    return invalid('Unsupported connected-services selection type.');
}
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
export function normalizeConnectedServiceSelectionForRunStart(input) {
    const normalized = normalizeConnectedServiceSelectionInput(input);
    if (!normalized.ok)
        return normalized;
    if (normalized.defaultServiceIds.length > 0 && normalized.bindings) {
        return invalid(`A bare service default token [${normalized.defaultServiceIds.join(', ')}] cannot be combined with `
            + 'explicit connected-service selections for other services in the same request.');
    }
    return { ok: true, bindings: normalized.bindings };
}
//# sourceMappingURL=normalizeConnectedServiceSelectionInput.js.map