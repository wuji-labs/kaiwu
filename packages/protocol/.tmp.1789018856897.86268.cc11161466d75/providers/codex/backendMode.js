export const CODEX_BACKEND_MODES = ['mcp', 'acp', 'appServer'];
export function normalizeCodexBackendMode(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === 'mcp')
            return 'mcp';
        if (trimmed === 'appServer')
            return 'appServer';
        if (trimmed === 'acp' || trimmed === 'mcp_resume')
            return 'acp';
        return null;
    }
    return null;
}
//# sourceMappingURL=backendMode.js.map