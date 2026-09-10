import { z } from 'zod';
export const BackendTargetKindSchema = z.enum(['builtInAgent', 'configuredAcpBackend']);
const BuiltInAgentTargetSchema = z.object({
    kind: z.literal('builtInAgent'),
    agentId: z.string().min(1),
});
const ConfiguredAcpBackendTargetSchema = z.object({
    kind: z.literal('configuredAcpBackend'),
    backendId: z.string().min(1),
});
export const BackendTargetRefSchema = z.union([BuiltInAgentTargetSchema, ConfiguredAcpBackendTargetSchema]);
export const BackendTargetKeySchema = z.string().regex(/^(agent|acpBackend):.+$/, 'Invalid backend target key');
export function buildBackendTargetKey(target) {
    return target.kind === 'builtInAgent'
        ? BackendTargetKeySchema.parse(`agent:${target.agentId}`)
        : BackendTargetKeySchema.parse(`acpBackend:${target.backendId}`);
}
export function parseBackendTargetKey(key) {
    const parsed = BackendTargetKeySchema.parse(key);
    if (parsed.startsWith('agent:')) {
        return BackendTargetRefSchema.parse({ kind: 'builtInAgent', agentId: parsed.slice('agent:'.length) });
    }
    return BackendTargetRefSchema.parse({ kind: 'configuredAcpBackend', backendId: parsed.slice('acpBackend:'.length) });
}
export function isBuiltInAgentTarget(target) {
    return target.kind === 'builtInAgent';
}
export function isConfiguredAcpBackendTarget(target) {
    return target.kind === 'configuredAcpBackend';
}
//# sourceMappingURL=backendTargetRef.js.map