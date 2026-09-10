import tweetnacl from 'tweetnacl';
import { stringifySerializedJsonValue } from './serializedJsonValue.js';
export const PUBLIC_SHARE_DATA_ENCRYPTION_KEY_BYTES = 32;
const DATA_KEY_BASE64_LENGTH = Math.ceil(PUBLIC_SHARE_DATA_ENCRYPTION_KEY_BYTES / 3) * 4;
const DATA_KEY_BASE64_PLACEHOLDER = 'A'.repeat(DATA_KEY_BASE64_LENGTH);
const SECRETBOX_OVERHEAD_BYTES = tweetnacl.secretbox.nonceLength + tweetnacl.secretbox.overheadLength;
function utf8Length(value) {
    return new TextEncoder().encode(value).byteLength;
}
export const PUBLIC_SHARE_ENCRYPTED_DATA_KEY_LEGACY_V0_BYTES = SECRETBOX_OVERHEAD_BYTES + utf8Length(JSON.stringify({ v: 0, keyB64: DATA_KEY_BASE64_PLACEHOLDER }));
export const PUBLIC_SHARE_ENCRYPTED_DATA_KEY_CURRENT_V0_BYTES = SECRETBOX_OVERHEAD_BYTES + utf8Length(stringifySerializedJsonValue({ v: 0, keyB64: DATA_KEY_BASE64_PLACEHOLDER }));
function copyToArrayBufferBackedBytes(bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
}
/**
 * Parses the public-share v0 SecretBox envelope structurally.
 *
 * The token-derived SecretBox key is intentionally unavailable to the server,
 * so authenticity is verified by the public viewer during decryption. The
 * server can still fail closed on every wire shape except the two deployed
 * fixed-length encodings for a 32-byte data key.
 */
export function parsePublicShareEncryptedDataKeyEnvelopeV0(bytes) {
    if (bytes.byteLength === PUBLIC_SHARE_ENCRYPTED_DATA_KEY_CURRENT_V0_BYTES) {
        return { format: 'serialized-json-v1', encryptedDataKey: copyToArrayBufferBackedBytes(bytes) };
    }
    if (bytes.byteLength === PUBLIC_SHARE_ENCRYPTED_DATA_KEY_LEGACY_V0_BYTES) {
        return { format: 'legacy-json', encryptedDataKey: copyToArrayBufferBackedBytes(bytes) };
    }
    return null;
}
//# sourceMappingURL=publicShareEncryptedDataKeyEnvelopeV0.js.map