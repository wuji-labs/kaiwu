import { z } from 'zod';
import { buildAcpConfigOptionOverridesV1, } from '../sessionMetadata/metadataOverridesV1.js';
export const SpawnConfigOptionValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
/**
 * Read a single config-option value from canonical `AcpConfigOptionOverridesV1` by option id. This
 * is the ONE shared reader used by both the session-spawn path and execution-run backends so effort
 * (`reasoning_effort`) and other options are extracted identically. Returns `undefined` when the
 * option is absent or cleared (`null`).
 */
export function readSpawnConfigOptionOverrideValue(overrides, optionId) {
    const override = overrides?.overrides?.[optionId];
    if (!override)
        return undefined;
    const { value } = override;
    return value === null ? undefined : value;
}
export function buildAcpConfigOptionOverridesV1FromConfigOptions(params) {
    const entries = Object.entries(params.configOptions ?? {})
        .filter(([id]) => id.trim().length > 0);
    if (entries.length === 0)
        return null;
    const updatedAt = typeof params.updatedAt === 'number' && Number.isFinite(params.updatedAt)
        ? params.updatedAt
        : Date.now();
    return buildAcpConfigOptionOverridesV1({
        updatedAt,
        overrides: Object.fromEntries(entries.map(([id, value]) => [
            id,
            { updatedAt, value },
        ])),
    });
}
export function findSpawnConfigOptionAliasConflicts(params) {
    const canonical = params.sessionConfigOptionOverrides;
    const shorthand = params.configOptions;
    if (!canonical || !shorthand)
        return [];
    const conflicts = [];
    for (const [optionId, shorthandValue] of Object.entries(shorthand)) {
        const canonicalOverride = canonical.overrides[optionId];
        if (!canonicalOverride || Object.is(canonicalOverride.value, shorthandValue))
            continue;
        conflicts.push({
            optionId,
            canonicalValue: canonicalOverride.value,
            shorthandValue,
        });
    }
    return conflicts;
}
export function mergeSpawnConfigOptionAliases(params) {
    const conflicts = findSpawnConfigOptionAliasConflicts(params);
    if (conflicts.length > 0)
        return { ok: false, conflicts };
    const canonical = params.sessionConfigOptionOverrides ?? null;
    const shorthand = buildAcpConfigOptionOverridesV1FromConfigOptions({
        configOptions: params.configOptions,
        updatedAt: params.updatedAt,
    });
    if (!canonical) {
        return shorthand
            ? { ok: true, value: shorthand, source: 'configOptions' }
            : { ok: true, value: null, source: null };
    }
    if (!shorthand) {
        return { ok: true, value: canonical, source: 'sessionConfigOptionOverrides' };
    }
    return {
        ok: true,
        value: {
            ...canonical,
            overrides: {
                ...shorthand.overrides,
                ...canonical.overrides,
            },
        },
        source: 'sessionConfigOptionOverrides+configOptions',
    };
}
//# sourceMappingURL=sessionSpawnConfigOptions.js.map