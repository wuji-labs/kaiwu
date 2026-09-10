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
/**
 * The legacy origin vocabulary, declared ONCE. The catalog wire schema derives its legacy
 * arm from this list (`sessionWorkStateRpc.ts`) instead of re-listing the literals, so an
 * origin the schema accepts is always one this module can fold to a canonical identity.
 */
export declare const LEGACY_SKILL_CATALOG_ORIGINS_V1: readonly [string, ...string[]];
export type SkillCatalogOriginV1 = 'vendor' | 'happier';
export type SkillCatalogItemIdentityV1 = Readonly<{
    id: string;
    origin: SkillCatalogOriginV1;
    name: string;
    backendId: string | null;
    projectionRef: string | null;
}>;
/**
 * Returns `null` when the item carries no usable identity — a missing name, a missing origin,
 * or an origin outside the canonical and legacy sets. An unidentifiable catalog item can never
 * be the target of a reference, so it is skipped rather than guessed at.
 */
export declare function resolveSkillCatalogItemIdentityV1(value: unknown): SkillCatalogItemIdentityV1 | null;
//# sourceMappingURL=skillCatalogItemIdentityV1.d.ts.map