import { resolveApplicableServerBindingV1 } from './resolveServerBindingV1.js';
export function resolveEffectiveServersV1(settings, params) {
    const serversByName = {};
    for (const server of settings.servers) {
        const resolved = resolveApplicableServerBindingV1({
            server,
            bindings: settings.bindings,
            machineId: params.machineId,
            directory: params.directory,
            normalizePath: params.normalizePath,
        });
        serversByName[server.name] = {
            serverId: server.id,
            name: server.name,
            bindingId: resolved.bindingId,
            enabled: resolved.enabled,
            config: resolved.config,
        };
    }
    return { directory: params.directory, strictMode: settings.strictMode, serversByName };
}
//# sourceMappingURL=resolveEffectiveServersV1.js.map