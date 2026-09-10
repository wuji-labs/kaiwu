import { z } from 'zod';
import { type AcpConfigOptionOverridesV1 } from '../sessionMetadata/metadataOverridesV1.js';
export declare const SpawnConfigOptionValueSchema: any;
export type SpawnConfigOptionValue = z.infer<typeof SpawnConfigOptionValueSchema>;
/**
 * Read a single config-option value from canonical `AcpConfigOptionOverridesV1` by option id. This
 * is the ONE shared reader used by both the session-spawn path and execution-run backends so effort
 * (`reasoning_effort`) and other options are extracted identically. Returns `undefined` when the
 * option is absent or cleared (`null`).
 */
export declare function readSpawnConfigOptionOverrideValue(overrides: AcpConfigOptionOverridesV1 | null | undefined, optionId: string): SpawnConfigOptionValue | undefined;
export type SpawnConfigOptionsAliasConflict = Readonly<{
    optionId: string;
    canonicalValue: SpawnConfigOptionValue;
    shorthandValue: SpawnConfigOptionValue;
}>;
export declare function buildAcpConfigOptionOverridesV1FromConfigOptions(params: Readonly<{
    configOptions?: Readonly<Record<string, SpawnConfigOptionValue>> | null;
    updatedAt?: number;
}>): AcpConfigOptionOverridesV1 | null;
export declare function findSpawnConfigOptionAliasConflicts(params: Readonly<{
    sessionConfigOptionOverrides?: AcpConfigOptionOverridesV1 | null;
    configOptions?: Readonly<Record<string, SpawnConfigOptionValue>> | null;
}>): readonly SpawnConfigOptionsAliasConflict[];
export declare function mergeSpawnConfigOptionAliases(params: Readonly<{
    sessionConfigOptionOverrides?: AcpConfigOptionOverridesV1 | null;
    configOptions?: Readonly<Record<string, SpawnConfigOptionValue>> | null;
    updatedAt?: number;
}>): Readonly<{
    ok: true;
    value: AcpConfigOptionOverridesV1 | null;
    source: 'sessionConfigOptionOverrides' | 'configOptions' | 'sessionConfigOptionOverrides+configOptions' | null;
} | {
    ok: false;
    conflicts: readonly SpawnConfigOptionsAliasConflict[];
}>;
//# sourceMappingURL=sessionSpawnConfigOptions.d.ts.map