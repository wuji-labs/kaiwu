function normalizeIdPart(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
}
function encodeIdPart(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
export function buildVendorSessionWorkStateItemId(kind, vendorRef) {
    const normalized = normalizeIdPart(vendorRef);
    if (!normalized) {
        throw new Error('vendorRef is required');
    }
    return `${kind}:${normalized}`;
}
export function buildDeterministicSessionWorkStateItemId(params) {
    const sourceFamily = normalizeIdPart(params.sourceFamily);
    const stableParts = params.stableParts.map(normalizeIdPart).filter((part) => Boolean(part));
    if (!sourceFamily || stableParts.length === 0) {
        throw new Error('sourceFamily and stableParts are required');
    }
    return `${params.kind}:derived:${encodeIdPart(sourceFamily)}:${encodeIdPart(stableParts.join('|'))}`;
}
//# sourceMappingURL=sessionWorkStateItemIds.js.map