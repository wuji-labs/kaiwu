import type { McpServerBindingTargetV1, McpServerBindingV1, McpServerCatalogEntryV1 } from './settingsV1.js';
export type ResolvedServerBindingV1 = Readonly<{
    binding: McpServerBindingV1 | null;
    bindingId: string | null;
    bindingTargetKind: McpServerBindingTargetV1['t'] | null;
    enabled: boolean;
    config: McpServerCatalogEntryV1;
}>;
export declare function defaultNormalizeMcpPathV1(path: string): string;
export declare function resolveApplicableServerBindingV1(params: Readonly<{
    server: McpServerCatalogEntryV1;
    bindings: ReadonlyArray<McpServerBindingV1>;
    machineId: string;
    directory: string;
    normalizePath?: (value: string) => string;
}>): ResolvedServerBindingV1;
export declare function resolvePortableServerBindingV1(params: Readonly<{
    server: McpServerCatalogEntryV1;
    bindings: ReadonlyArray<McpServerBindingV1>;
}>): ResolvedServerBindingV1 | null;
//# sourceMappingURL=resolveServerBindingV1.d.ts.map