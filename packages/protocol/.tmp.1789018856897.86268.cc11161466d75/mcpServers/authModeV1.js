function valueRefsFromServer(server) {
    const refs = Object.values(server.env ?? {});
    const headerRefs = Object.values(server.remote?.headers ?? {});
    return [...refs, ...headerRefs];
}
function isEnvironmentTemplateLiteral(value) {
    return /\$\{[A-Z0-9_]+(?::[-=][^}]*)?\}/.test(value);
}
export function inferMcpServerAuthModeV1(server) {
    const refs = valueRefsFromServer(server);
    if (refs.length === 0)
        return 'none';
    if (refs.some((valueRef) => valueRef?.t === 'savedSecret')) {
        return 'savedSecret';
    }
    const literals = refs.filter((valueRef) => valueRef?.t === 'literal');
    if (literals.length === refs.length && literals.every((valueRef) => isEnvironmentTemplateLiteral(valueRef.v))) {
        return 'machineEnv';
    }
    return 'plainText';
}
//# sourceMappingURL=authModeV1.js.map