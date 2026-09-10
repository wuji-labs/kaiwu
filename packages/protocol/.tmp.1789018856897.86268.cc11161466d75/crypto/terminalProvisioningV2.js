import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { openBoxBundle, sealBoxBundle } from './boxBundle.js';
import { encodeCanonicalLengthDelimited } from './canonicalDigest.js';
export const TERMINAL_PROVISIONING_V2_VERSION_BYTE = 0;
export const TERMINAL_PROVISIONING_V2_CONTENT_PRIVATE_KEY_BYTES = 32;
export const TERMINAL_PROVISIONING_V2_PLAINTEXT_BYTES = 1 + TERMINAL_PROVISIONING_V2_CONTENT_PRIVATE_KEY_BYTES;
const TERMINAL_PROVISIONING_V3_MAGIC = new Uint8Array([0x48, 0x50, 0x56, 0x33]); // HPV3
const TERMINAL_PROVISIONING_V3_MAC_BYTES = 32;
const TERMINAL_PROVISIONING_V3_SEALED_V2_BYTES = 32 + 24 + 16 + TERMINAL_PROVISIONING_V2_PLAINTEXT_BYTES;
const TERMINAL_PROVISIONING_V3_PAYLOAD_BYTES = TERMINAL_PROVISIONING_V3_MAGIC.length
    + TERMINAL_PROVISIONING_V3_SEALED_V2_BYTES
    + TERMINAL_PROVISIONING_V3_MAC_BYTES;
const TERMINAL_PROVISIONING_V3_MAC_DOMAIN = 'happier-terminal-provisioning-v3';
export function sealTerminalProvisioningV2Payload(params) {
    if (params.contentPrivateKey.length !== TERMINAL_PROVISIONING_V2_CONTENT_PRIVATE_KEY_BYTES) {
        throw new Error(`Invalid content private key length: ${params.contentPrivateKey.length}`);
    }
    const plaintext = new Uint8Array(TERMINAL_PROVISIONING_V2_PLAINTEXT_BYTES);
    plaintext[0] = TERMINAL_PROVISIONING_V2_VERSION_BYTE;
    plaintext.set(params.contentPrivateKey, 1);
    return sealBoxBundle({
        plaintext,
        recipientPublicKey: params.recipientPublicKey,
        randomBytes: params.randomBytes,
    });
}
export function openTerminalProvisioningV2Payload(params) {
    const opened = openBoxBundle({
        bundle: params.payload,
        recipientSecretKeyOrSeed: params.recipientSecretKeyOrSeed,
    });
    if (!opened)
        return null;
    if (opened.length !== TERMINAL_PROVISIONING_V2_PLAINTEXT_BYTES)
        return null;
    if (opened[0] !== TERMINAL_PROVISIONING_V2_VERSION_BYTE)
        return null;
    return opened.slice(1);
}
function assertTerminalProvisioningV3Context(params) {
    if (params.terminalEphemeralPublicKey.length !== 32) {
        throw new Error(`Invalid terminal ephemeral public key length: ${params.terminalEphemeralPublicKey.length}`);
    }
    if (params.pairingSecret.length !== 32) {
        throw new Error(`Invalid pairing secret length: ${params.pairingSecret.length}`);
    }
    if (!Number.isSafeInteger(params.createdAtMs)
        || !Number.isSafeInteger(params.expiresAtMs)
        || params.createdAtMs < 0
        || params.expiresAtMs <= params.createdAtMs) {
        throw new Error('Invalid terminal provisioning validity window');
    }
}
function computeTerminalProvisioningV3Mac(params) {
    return hmac(sha256, params.pairingSecret, encodeCanonicalLengthDelimited([
        TERMINAL_PROVISIONING_V3_MAC_DOMAIN,
        params.terminalEphemeralPublicKey,
        String(params.createdAtMs),
        String(params.expiresAtMs),
        params.sealedV2Payload,
    ]));
}
function equalBytesConstantTime(left, right) {
    if (left.length !== right.length)
        return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
}
export function isTerminalProvisioningV3Payload(payload) {
    if (payload.length !== TERMINAL_PROVISIONING_V3_PAYLOAD_BYTES)
        return false;
    return TERMINAL_PROVISIONING_V3_MAGIC.every((byte, index) => payload[index] === byte);
}
export function sealTerminalProvisioningV3Payload(params) {
    assertTerminalProvisioningV3Context(params);
    const sealedV2Payload = sealTerminalProvisioningV2Payload({
        contentPrivateKey: params.contentPrivateKey,
        recipientPublicKey: params.terminalEphemeralPublicKey,
        randomBytes: params.randomBytes,
    });
    const mac = computeTerminalProvisioningV3Mac({ ...params, sealedV2Payload });
    const payload = new Uint8Array(TERMINAL_PROVISIONING_V3_PAYLOAD_BYTES);
    payload.set(TERMINAL_PROVISIONING_V3_MAGIC, 0);
    payload.set(sealedV2Payload, TERMINAL_PROVISIONING_V3_MAGIC.length);
    payload.set(mac, TERMINAL_PROVISIONING_V3_MAGIC.length + sealedV2Payload.length);
    return payload;
}
export function openTerminalProvisioningV3Payload(params) {
    try {
        assertTerminalProvisioningV3Context(params);
    }
    catch {
        return null;
    }
    if (!Number.isSafeInteger(params.nowMs) || params.nowMs < params.createdAtMs || params.nowMs > params.expiresAtMs) {
        return null;
    }
    if (!isTerminalProvisioningV3Payload(params.payload))
        return null;
    const sealedPayloadStart = TERMINAL_PROVISIONING_V3_MAGIC.length;
    const macStart = sealedPayloadStart + TERMINAL_PROVISIONING_V3_SEALED_V2_BYTES;
    const sealedV2Payload = params.payload.slice(sealedPayloadStart, macStart);
    const receivedMac = params.payload.slice(macStart);
    const expectedMac = computeTerminalProvisioningV3Mac({ ...params, sealedV2Payload });
    if (!equalBytesConstantTime(receivedMac, expectedMac))
        return null;
    return openTerminalProvisioningV2Payload({
        payload: sealedV2Payload,
        recipientSecretKeyOrSeed: params.recipientSecretKeyOrSeed,
    });
}
//# sourceMappingURL=terminalProvisioningV2.js.map