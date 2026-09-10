/**
 * The canonical identity of a skill catalog item (D-23, derived in EU-D0).
 *
 * A skill is identified by the tuple `(origin, backendId, projectionRef, name)`, materialized
 * as one string. `path` is deliberately NOT part of it: a path is worktree- and machine-local,
 * so embedding it in a persisted reference would make the reference go stale (D-3/INV-9).
 *
 * This is a byte-for-byte port of `../dev`'s
 * `packages/protocol/src/runtime/catalog/skills.ts` derivation, including its legacy-origin
 * folding. The two repositories must agree exactly: a `happier.skill` reference is persisted
 * and transmitted, so a reference written by one repository is resolved by the other.
 */
const LEGACY_VENDOR_SKILL_BACKENDS = {
    codex_native: 'codex',
    opencode_native: 'opencode',
    claude_native: 'claude',
    pi_native: 'pi',
};
const LEGACY_HAPPIER_SKILL_ORIGINS = ['happier_projected', 'text_fallback_only'];
/**
 * The legacy origin vocabulary, declared ONCE. The catalog wire schema derives its legacy
 * arm from this list (`sessionWorkStateRpc.ts`) instead of re-listing the literals, so an
 * origin the schema accepts is always one this module can fold to a canonical identity.
 */
export const LEGACY_SKILL_CATALOG_ORIGINS_V1 = [
    ...Object.keys(LEGACY_VENDOR_SKILL_BACKENDS),
    ...LEGACY_HAPPIER_SKILL_ORIGINS,
];
function readString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function readLegacyVendorBackend(origin) {
    return Object.prototype.hasOwnProperty.call(LEGACY_VENDOR_SKILL_BACKENDS, origin)
        ? LEGACY_VENDOR_SKILL_BACKENDS[origin]
        : null;
}
/**
 * Returns `null` when the item carries no usable identity — a missing name, a missing origin,
 * or an origin outside the canonical and legacy sets. An unidentifiable catalog item can never
 * be the target of a reference, so it is skipped rather than guessed at.
 */
export function resolveSkillCatalogItemIdentityV1(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const item = value;
    const name = readString(item.name);
    const rawOrigin = readString(item.origin);
    if (!name || !rawOrigin)
        return null;
    const legacyBackendId = readLegacyVendorBackend(rawOrigin);
    const origin = rawOrigin === 'vendor' || rawOrigin === 'happier'
        ? rawOrigin
        : legacyBackendId
            ? 'vendor'
            : LEGACY_HAPPIER_SKILL_ORIGINS.includes(rawOrigin)
                ? 'happier'
                : null;
    if (!origin)
        return null;
    const backendId = readString(item.backendId) ?? legacyBackendId;
    const projectionRef = readString(item.projectionRef)
        ?? readString(item.projectionKind)
        ?? (origin === 'happier' && rawOrigin !== 'happier' ? rawOrigin : null);
    const id = readString(item.id)
        ?? [origin, backendId, projectionRef, name]
            .filter((part) => typeof part === 'string' && part.length > 0)
            .join(':');
    return { id, origin, name, backendId, projectionRef };
}
//# sourceMappingURL=skillCatalogItemIdentityV1.js.map