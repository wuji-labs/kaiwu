import { z } from 'zod';
import { McpDetectedProviderV1Schema } from './daemonRpcV1.js';
import { McpServerCatalogEntryTransportV1Schema } from './settingsV1.js';
import { SessionMcpSelectionV1Schema } from './sessionSelectionV1.js';
export const McpPreviewAuthModeV1Schema = z.enum(['none', 'savedSecret', 'machineEnv', 'plainText', 'unknown']);
export const McpPreviewSourceKindV1Schema = z.enum(['builtIn', 'managed', 'detected']);
export const McpPreviewScopeKindV1Schema = z.enum([
    'builtIn',
    'allMachines',
    'machine',
    'workspace',
    'providerUser',
    'providerProject',
]);
export const McpPreviewEntryAvailabilityV1Schema = z.union([
    z.literal('active'),
    z.literal('available'),
    z.literal('unavailable'),
    z.literal('readOnly'),
]);
const ManagedAvailabilityValues = ['active', 'available', 'unavailable'];
export const ManagedSessionMcpAvailabilityV1Schema = z.custom((value) => typeof value === 'string' && ManagedAvailabilityValues.includes(value));
const ManagedReasonValues = [
    'active_by_default',
    'forced_included',
    'forced_excluded',
    'managed_servers_disabled',
    'binding_disabled',
    'available_portable',
    'not_portable',
];
export const ManagedSessionMcpReasonCodeV1Schema = z.custom((value) => typeof value === 'string' && ManagedReasonValues.includes(value));
const ManagedPortabilityValues = ['portable', 'machine_scoped'];
export const ManagedSessionMcpPortabilityV1Schema = z.custom((value) => typeof value === 'string' && ManagedPortabilityValues.includes(value));
const McpPreviewEntryBaseV1Schema = z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1).optional(),
    transport: McpServerCatalogEntryTransportV1Schema,
    authMode: McpPreviewAuthModeV1Schema,
    selected: z.boolean(),
    selectable: z.boolean(),
    availability: McpPreviewEntryAvailabilityV1Schema,
    sourceKind: McpPreviewSourceKindV1Schema,
    scopeKind: McpPreviewScopeKindV1Schema,
});
export const ManagedMcpPreviewEntryV1Schema = McpPreviewEntryBaseV1Schema.extend({
    serverId: z.string().min(1),
    sourceKind: z.literal('managed'),
    scopeKind: z.union([z.literal('allMachines'), z.literal('machine'), z.literal('workspace')]),
    reasonCode: ManagedSessionMcpReasonCodeV1Schema,
    portability: ManagedSessionMcpPortabilityV1Schema,
    defaultSelected: z.boolean(),
});
export const BuiltInMcpPreviewEntryV1Schema = McpPreviewEntryBaseV1Schema.extend({
    sourceKind: z.literal('builtIn'),
    scopeKind: z.literal('builtIn'),
});
export const DetectedMcpPreviewEntryV1Schema = McpPreviewEntryBaseV1Schema.extend({
    sourceKind: z.literal('detected'),
    scopeKind: z.union([z.literal('providerUser'), z.literal('providerProject')]),
    provider: McpDetectedProviderV1Schema,
    enabled: z.union([z.boolean(), z.null()]),
    envKeyCount: z.number().int().min(0),
    headerKeyCount: z.number().int().min(0),
    sourcePath: z.string().min(1),
});
export const DaemonMcpServersPreviewRequestSchema = z.object({
    machineId: z.string().min(1),
    directory: z.string().min(1).max(10_000),
    agentId: z.string().min(1),
    selection: SessionMcpSelectionV1Schema.optional(),
}).passthrough();
export const DaemonMcpServersPreviewResponseSchema = z.union([
    z.object({
        ok: z.literal(true),
        builtIn: z.array(BuiltInMcpPreviewEntryV1Schema),
        managed: z.array(ManagedMcpPreviewEntryV1Schema),
        detected: z.array(DetectedMcpPreviewEntryV1Schema),
        warnings: z.array(z.string()).optional(),
    }).passthrough(),
    z.object({
        ok: z.literal(false),
        errorCode: z.enum(['invalid_request', 'internal_error']),
        error: z.string().min(1),
    }).passthrough(),
]);
//# sourceMappingURL=previewV1.js.map