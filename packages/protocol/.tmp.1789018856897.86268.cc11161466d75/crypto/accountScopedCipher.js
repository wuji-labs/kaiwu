import tweetnacl from 'tweetnacl';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { decodeBase64, encodeBase64 } from './base64.js';
import { deriveKey } from './keyDerivation.js';
import { parseSerializedJsonValue } from './serializedJsonValue.js';
const ACCOUNT_SCOPED_MAGIC_V1 = 0xa1;
export function accountScopedCiphertextBase64LengthForPlaintextBytes(plaintextBytes) {
    if (!Number.isSafeInteger(plaintextBytes) || plaintextBytes < 0) {
        throw new Error(`Invalid account-scoped plaintext byte length: ${plaintextBytes}`);
    }
    const ciphertextBytes = 2 + tweetnacl.secretbox.nonceLength + tweetnacl.secretbox.overheadLength + plaintextBytes;
    return 4 * Math.ceil(ciphertextBytes / 3);
}
const ACCOUNT_SCOPED_KIND_BYTE = {
    account_settings: 1,
    automation_template_payload: 2,
    connected_service_credential: 3,
    connected_service_quota_snapshot: 4,
    session_respawn_environment: 5,
    provider_account_usage_snapshot: 6,
    session_organization_display: 7,
    session_first_intent: 8,
    action_operation_snapshot: 9,
    account_session_draft_private_payload: 10,
};
const LEGACY_READ_ONLY_ACCOUNT_SCOPED_BLOB_KINDS = new Set([
    'connected_service_quota_snapshot',
]);
function encodeUtf8(value) {
    return new TextEncoder().encode(value);
}
function hmacSha512(key, data) {
    return hmac(sha512, key, data);
}
export function deriveAccountMachineKeyFromRecoverySecret(recoverySecret) {
    const contentSeed = deriveKey(recoverySecret, 'Happy EnCoder', ['content']);
    // libsodium crypto_box_seed_keypair uses SHA-512(seed) and takes the first 32 bytes as the scalar.
    return sha512(contentSeed).slice(0, 32);
}
function resolveMachineKey(material) {
    return material.type === 'dataKey'
        ? material.machineKey
        : deriveAccountMachineKeyFromRecoverySecret(material.secret);
}
function deriveAccountScopedSecretboxKey(params) {
    const info = encodeUtf8(`happier:account_scoped:${params.kind}:v1`);
    return hmacSha512(params.machineKey, info).slice(0, 32);
}
function tryParseJson(value) {
    try {
        const decoded = new TextDecoder().decode(value);
        return parseSerializedJsonValue(decoded);
    }
    catch {
        return null;
    }
}
export function sealAccountScopedBlobCiphertext(params) {
    if (LEGACY_READ_ONLY_ACCOUNT_SCOPED_BLOB_KINDS.has(params.kind)) {
        throw new Error(`Account-scoped blob kind ${params.kind} is legacy read-only and cannot be sealed`);
    }
    const kindByte = ACCOUNT_SCOPED_KIND_BYTE[params.kind];
    if (!Number.isFinite(kindByte)) {
        throw new Error(`Unsupported account-scoped blob kind: ${String(params.kind)}`);
    }
    const machineKey = resolveMachineKey(params.material);
    const key = deriveAccountScopedSecretboxKey({ machineKey, kind: params.kind });
    const nonce = params.randomBytes(tweetnacl.secretbox.nonceLength);
    if (nonce.length !== tweetnacl.secretbox.nonceLength) {
        throw new Error(`Invalid nonce length: ${nonce.length}`);
    }
    const plaintextBytes = encodeUtf8(JSON.stringify(params.payload));
    const boxed = tweetnacl.secretbox(plaintextBytes, nonce, key);
    const out = new Uint8Array(2 + nonce.length + boxed.length);
    out[0] = ACCOUNT_SCOPED_MAGIC_V1;
    out[1] = kindByte;
    out.set(nonce, 2);
    out.set(boxed, 2 + nonce.length);
    return encodeBase64(out, 'base64');
}
export function openAccountScopedBlobCiphertext(params) {
    const kindByte = ACCOUNT_SCOPED_KIND_BYTE[params.kind];
    if (!Number.isFinite(kindByte)) {
        return null;
    }
    let bytes;
    try {
        bytes = decodeBase64(params.ciphertext, 'base64');
    }
    catch {
        return null;
    }
    const machineKey = resolveMachineKey(params.material);
    if (bytes.length >= 2 + tweetnacl.secretbox.nonceLength + 16 && bytes[0] === ACCOUNT_SCOPED_MAGIC_V1) {
        if (bytes[1] !== kindByte) {
            return null;
        }
        const nonce = bytes.slice(2, 2 + tweetnacl.secretbox.nonceLength);
        const boxed = bytes.slice(2 + tweetnacl.secretbox.nonceLength);
        const key = deriveAccountScopedSecretboxKey({ machineKey, kind: params.kind });
        const opened = tweetnacl.secretbox.open(boxed, nonce, key);
        const parsed = opened ? tryParseJson(new Uint8Array(opened)) : null;
        if (parsed !== null) {
            return { format: 'account_scoped_v1', value: parsed };
        }
    }
    // Backwards compatibility: legacy secretbox payloads that omitted magic/version bytes.
    // Try opening with either:
    // - raw machineKey (dataKey mode, e.g. old automation templates)
    // - raw recovery secret (legacy mode, e.g. old account settings/templates)
    if (bytes.length < tweetnacl.secretbox.nonceLength + 16) {
        return null;
    }
    const nonce = bytes.slice(0, tweetnacl.secretbox.nonceLength);
    const boxed = bytes.slice(tweetnacl.secretbox.nonceLength);
    const candidates = [];
    candidates.push(machineKey);
    if (params.material.type === 'legacy') {
        candidates.push(params.material.secret);
    }
    for (const key of candidates) {
        try {
            const opened = tweetnacl.secretbox.open(boxed, nonce, key);
            const parsed = opened ? tryParseJson(new Uint8Array(opened)) : null;
            if (parsed !== null) {
                return { format: 'legacy_secretbox', value: parsed };
            }
        }
        catch {
            // continue
        }
    }
    return null;
}
//# sourceMappingURL=accountScopedCipher.js.map