import { SessionMcpSelectionV1Schema } from './sessionSelectionV1.js';
import { resolveApplicableServerBindingV1, resolvePortableServerBindingV1, } from './resolveServerBindingV1.js';
export function resolveManagedSessionMcpSelectionV1(settings, params) {
    const selection = SessionMcpSelectionV1Schema.parse(params.selection ?? {});
    const forcedIncludes = new Set(selection.forceIncludeServerIds);
    const forcedExcludes = new Set(selection.forceExcludeServerIds);
    const itemsByName = {};
    const selectedServersByName = {};
    for (const server of settings.servers) {
        const bindings = settings.bindings.filter((binding) => binding.serverId === server.id);
        const applicable = resolveApplicableServerBindingV1({
            server,
            bindings,
            machineId: params.machineId,
            directory: params.directory,
            normalizePath: params.normalizePath,
        });
        const portable = resolvePortableServerBindingV1({ server, bindings });
        const hasApplicableBinding = applicable.binding !== null;
        const portability = portable ? 'portable' : 'machine_scoped';
        const selectable = hasApplicableBinding || portable !== null;
        const defaultSelected = selection.managedServersEnabled && applicable.enabled;
        const forceExcluded = forcedExcludes.has(server.id);
        const forceIncluded = forcedIncludes.has(server.id) && !forceExcluded && selectable;
        const selectedResolution = forceExcluded
            ? null
            : forceIncluded
                ? applicable.binding
                    ? applicable
                    : portable
                : defaultSelected
                    ? applicable
                    : null;
        const selected = selectedResolution !== null;
        let availability;
        let reasonCode;
        if (selected && forceIncluded) {
            availability = 'active';
            reasonCode = 'forced_included';
        }
        else if (selected) {
            availability = 'active';
            reasonCode = 'active_by_default';
        }
        else if (forceExcluded) {
            availability = selectable ? 'available' : 'unavailable';
            reasonCode = 'forced_excluded';
        }
        else if (!selection.managedServersEnabled && hasApplicableBinding) {
            availability = 'available';
            reasonCode = 'managed_servers_disabled';
        }
        else if (hasApplicableBinding) {
            availability = 'available';
            reasonCode = 'binding_disabled';
        }
        else if (portable) {
            availability = 'available';
            reasonCode = 'available_portable';
        }
        else {
            availability = 'unavailable';
            reasonCode = 'not_portable';
        }
        const effectiveConfig = selectedResolution?.config ?? applicable.config ?? portable?.config ?? server;
        const bindingId = selectedResolution?.bindingId ?? applicable.bindingId ?? portable?.bindingId ?? null;
        const bindingTargetKind = selectedResolution?.bindingTargetKind ?? applicable.bindingTargetKind ?? portable?.bindingTargetKind ?? null;
        itemsByName[server.name] = {
            serverId: server.id,
            name: server.name,
            title: server.title,
            transport: server.transport,
            bindingId,
            bindingTargetKind,
            selected,
            selectable,
            availability,
            reasonCode,
            portability,
            defaultSelected,
            effectiveConfig,
        };
        if (selectedResolution) {
            selectedServersByName[server.name] = {
                serverId: server.id,
                name: server.name,
                bindingId: selectedResolution.bindingId,
                enabled: true,
                config: selectedResolution.config,
            };
        }
    }
    return {
        strictMode: settings.strictMode,
        selection,
        itemsByName,
        selectedServersByName,
    };
}
//# sourceMappingURL=resolveManagedSessionMcpSelectionV1.js.map