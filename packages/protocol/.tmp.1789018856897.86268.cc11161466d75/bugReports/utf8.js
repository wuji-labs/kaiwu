function tryCreateTextEncoder() {
    const TeCtor = globalThis.TextEncoder;
    if (typeof TeCtor !== 'function')
        return null;
    try {
        return new TeCtor();
    }
    catch {
        return null;
    }
}
export function utf8ByteLength(value) {
    const normalized = String(value ?? '');
    const encoder = tryCreateTextEncoder();
    if (encoder) {
        return encoder.encode(normalized).byteLength;
    }
    const BufferCtor = globalThis.Buffer;
    if (BufferCtor && typeof BufferCtor.byteLength === 'function') {
        try {
            return BufferCtor.byteLength(normalized, 'utf8');
        }
        catch {
            // ignore
        }
    }
    // Best-effort fallback (may under-count multi-byte code points).
    return normalized.length;
}
export function trimUtf8TextToMaxBytes(input, maxBytes) {
    const max = Math.max(1024, Math.floor(maxBytes));
    const normalized = String(input ?? '');
    const encoder = tryCreateTextEncoder();
    if (!encoder) {
        if (normalized.length <= max)
            return normalized;
        return normalized.slice(normalized.length - max);
    }
    const bytes = encoder.encode(normalized);
    if (bytes.byteLength <= max)
        return normalized;
    // Keep the most recent content (tail) while maximizing usage of the byte budget.
    let low = 0;
    let high = normalized.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = normalized.slice(mid);
        if (encoder.encode(candidate).byteLength > max) {
            low = mid + 1;
            continue;
        }
        high = mid;
    }
    return normalized.slice(low);
}
//# sourceMappingURL=utf8.js.map