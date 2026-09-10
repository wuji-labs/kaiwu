import type { McpServersSettingsV1, McpServerCatalogEntryV1 } from './settingsV1.js';
import { type SessionMcpSelectionV1 } from './sessionSelectionV1.js';
import type { ResolvedMcpServerV1 } from './resolveEffectiveServersV1.js';
export type ManagedSessionMcpAvailabilityV1 = 'active' | 'available' | 'unavailable';
export type ManagedSessionMcpReasonCodeV1 = 'active_by_default' | 'forced_included' | 'forced_excluded' | 'managed_servers_disabled' | 'binding_disabled' | 'available_portable' | 'not_portable';
export type ManagedSessionMcpPortabilityV1 = 'portable' | 'machine_scoped';
export type ManagedSessionMcpSelectionItemV1 = Readonly<{
    serverId: string;
    name: string;
    title?: string;
    transport: McpServerCatalogEntryV1['transport'];
    bindingId: string | null;
    bindingTargetKind: 'allMachines' | 'machine' | 'workspace' | null;
    selected: boolean;
    selectable: boolean;
    availability: ManagedSessionMcpAvailabilityV1;
    reasonCode: ManagedSessionMcpReasonCodeV1;
    portability: ManagedSessionMcpPortabilityV1;
    defaultSelected: boolean;
    effectiveConfig: McpServerCatalogEntryV1;
}>;
export type ResolveManagedSessionMcpSelectionV1Result = Readonly<{
    strictMode: boolean;
    selection: SessionMcpSelectionV1;
    itemsByName: Readonly<Record<string, ManagedSessionMcpSelectionItemV1>>;
    selectedServersByName: Readonly<Record<string, ResolvedMcpServerV1>>;
}>;
export declare function resolveManagedSessionMcpSelectionV1(settings: McpServersSettingsV1, params: Readonly<{
    machineId: string;
    directory: string;
    selection?: SessionMcpSelectionV1 | null | undefined;
    normalizePath?: (value: string) => string;
}>): ResolveManagedSessionMcpSelectionV1Result;
//# sourceMappingURL=resolveManagedSessionMcpSelectionV1.d.ts.map