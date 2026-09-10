import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
function encodeUtf8(value) {
    return new TextEncoder().encode(value);
}
function hmacSha512(key, data) {
    return hmac(sha512, key, data);
}
function deriveSecretKeyTreeRoot(seed, usage) {
    const I = hmacSha512(encodeUtf8(`${usage} Master Seed`), seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
}
function deriveSecretKeyTreeChild(chainCode, index) {
    const indexBytes = encodeUtf8(index);
    const data = new Uint8Array(1 + indexBytes.length);
    data[0] = 0;
    data.set(indexBytes, 1);
    const I = hmacSha512(chainCode, data);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
}
export function deriveKey(master, usage, path) {
    let state = deriveSecretKeyTreeRoot(master, usage);
    for (const index of path) {
        state = deriveSecretKeyTreeChild(state.chainCode, index);
    }
    return state.key;
}
//# sourceMappingURL=keyDerivation.js.map