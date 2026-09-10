import { z } from 'zod';
export const CodexAppServerPluginSummarySchema = z
    .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    installed: z.boolean().optional(),
    enabled: z.boolean().optional(),
    installPolicy: z.string().min(1).optional(),
})
    .passthrough();
function readString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function resolveVendorPluginRef(plugin) {
    const explicitPath = readString(plugin.path);
    if (explicitPath)
        return explicitPath;
    const id = readString(plugin.id);
    return id?.startsWith('plugin://') ? id : null;
}
export function normalizeCodexAppServerPluginSummaries(value) {
    const plugins = Array.isArray(value) ? value : [];
    return plugins.flatMap((plugin) => {
        const parsed = CodexAppServerPluginSummarySchema.safeParse(plugin);
        if (!parsed.success)
            return [];
        const vendorPluginRef = resolveVendorPluginRef(parsed.data);
        const name = readString(parsed.data.name) ?? readString(parsed.data.id);
        if (!vendorPluginRef || !name)
            return [];
        const enabled = parsed.data.enabled === true;
        const installed = parsed.data.installed === true;
        return [{
                vendorPluginRef,
                name,
                ...(readString(parsed.data.displayName) ? { displayName: readString(parsed.data.displayName) } : {}),
                ...(readString(parsed.data.description) ? { description: readString(parsed.data.description) } : {}),
                ...(typeof parsed.data.installed === 'boolean' ? { installed: parsed.data.installed } : {}),
                ...(typeof parsed.data.enabled === 'boolean' ? { enabled: parsed.data.enabled } : {}),
                mentionable: installed && enabled,
                ...(readString(parsed.data.installPolicy) ? { installPolicy: readString(parsed.data.installPolicy) } : {}),
            }];
    });
}
//# sourceMappingURL=appServerPlugin.js.map