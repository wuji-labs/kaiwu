import { decodeBase64, encodeBase64 } from '@/encryption/base64';

import { decodeUTF8, encodeUTF8 } from './text';

const IV_LENGTH_BYTES = 12;

/**
 * Imported keys by their base64 material. Every message of a session decrypts with the same key,
 * and `importKey` is an async round trip into the WebCrypto backend, so re-importing per call
 * doubled the async work of every decrypt in a page. The material itself is already resident in
 * the caller's session-key map; the non-extractable `CryptoKey` adds no new exposure.
 *
 * Bounded by the number of distinct session keys one runtime decrypts with; past that the least
 * recently used import is dropped and simply re-imported on next use. A failed import is evicted
 * so it cannot poison later calls with the same rejected promise.
 */
const AES_KEY_IMPORT_CACHE_MAX_ENTRIES = 256;
const importedAesKeys = new Map<string, Promise<CryptoKey>>();

function importAesGcmKeyFromBase64(keyB64: string): Promise<CryptoKey> {
    const cached = importedAesKeys.get(keyB64);
    if (cached) {
        importedAesKeys.delete(keyB64);
        importedAesKeys.set(keyB64, cached);
        return cached;
    }
    const keyBytes = new Uint8Array(decodeBase64(keyB64, 'base64'));
    const imported = globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    importedAesKeys.set(keyB64, imported);
    imported.catch(() => {
        if (importedAesKeys.get(keyB64) === imported) importedAesKeys.delete(keyB64);
    });
    if (importedAesKeys.size > AES_KEY_IMPORT_CACHE_MAX_ENTRIES) {
        const oldest = importedAesKeys.keys().next().value;
        if (oldest !== undefined) importedAesKeys.delete(oldest);
    }
    return imported;
}

async function encryptAesGcmBytes(plaintext: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const plaintextBytes = new Uint8Array(plaintext);
    const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);
    const ciphertextBytes = new Uint8Array(ciphertext);

    const out = new Uint8Array(iv.length + ciphertextBytes.length);
    out.set(iv, 0);
    out.set(ciphertextBytes, iv.length);
    return out;
}

async function decryptAesGcmBytes(payload: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    if (payload.byteLength < IV_LENGTH_BYTES) {
        throw new Error('Invalid AES-GCM payload');
    }
    const iv = payload.slice(0, IV_LENGTH_BYTES);
    const ciphertextBytes = payload.slice(IV_LENGTH_BYTES);
    const ciphertextPayloadBytes = new Uint8Array(ciphertextBytes);
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertextPayloadBytes);
    return new Uint8Array(plaintext);
}

export async function encryptAESGCMString(data: string, key64: string): Promise<string> {
    const key = await importAesGcmKeyFromBase64(key64);
    const plaintext = new TextEncoder().encode(data);
    const payload = await encryptAesGcmBytes(plaintext, key);
    return encodeBase64(payload, 'base64');
}

export async function decryptAESGCMString(data: string, key64: string): Promise<string | null> {
    try {
        const key = await importAesGcmKeyFromBase64(key64);
        const payloadBytes = new Uint8Array(decodeBase64(data, 'base64'));
        const plaintextBytes = await decryptAesGcmBytes(payloadBytes, key);
        return new TextDecoder().decode(plaintextBytes).trim();
    } catch {
        return null;
    }
}

export async function encryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array> {
    const encrypted = (await encryptAESGCMString(decodeUTF8(data), key64)).trim();
    return decodeBase64(encrypted, 'base64');
}

export async function decryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array | null> {
    const raw = await decryptAESGCMString(encodeBase64(data, 'base64'), key64);
    return raw ? encodeUTF8(raw) : null;
}
