import type { McpServerCatalogEntryV1, McpServersSettingsV1 } from './settingsV1.js';
export type ResolvedMcpServerV1 = Readonly<{
    serverId: string;
    name: string;
    bindingId: string | null;
    enabled: boolean;
    config: McpServerCatalogEntryV1;
}>;
export type ResolveEffectiveServersV1Result = Readonly<{
    directory: string;
    strictMode: boolean;
    serversByName: Readonly<Record<string, ResolvedMcpServerV1>>;
}>;
export declare function resolveEffectiveServersV1(settings: McpServersSettingsV1, params: Readonly<{
    machineId: string;
    directory: string;
    normalizePath?: (value: string) => string;
}>): ResolveEffectiveServersV1Result;
//# sourceMappingURL=resolveEffectiveServersV1.d.ts.map