import { z } from 'zod';
import tweetnacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from './base64.js';
import { deriveAccountMachineKeyFromRecoverySecret, } from './accountScopedCipher.js';
import { deriveKey } from './keyDerivation.js';
export const EncryptedStringV1Schema = z.object({
    t: z.literal('enc-v1'),
    c: z.string().min(1),
});
export const SecretStringV1Schema = z.object({
    _isSecretValue: z.literal(true),
    value: z.string().min(1).optional(),
    encryptedValue: EncryptedStringV1Schema.optional(),
});
const SETTINGS_SECRETS_USAGE = 'Happy Settings Secrets';
const SETTINGS_SECRETS_PATH = ['settings', 'secrets', 'v1'];
export function deriveSettingsSecretsKeyV1(masterSecret) {
    return deriveKey(masterSecret, SETTINGS_SECRETS_USAGE, SETTINGS_SECRETS_PATH);
}
function byteArraysEqual(left, right) {
    if (left.length !== right.length)
        return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index])
            return false;
    }
    return true;
}
export function deriveSettingsSecretsKeySetV1(material) {
    const canonicalSeed = material.type === 'dataKey'
        ? material.machineKey
        : deriveAccountMachineKeyFromRecoverySecret(material.secret);
    const writeKey = deriveSettingsSecretsKeyV1(canonicalSeed);
    const readKeys = [writeKey];
    if (material.type === 'legacy') {
        const legacyFallbackKey = deriveSettingsSecretsKeyV1(material.secret);
        if (!byteArraysEqual(legacyFallbackKey, writeKey)) {
            readKeys.push(legacyFallbackKey);
        }
    }
    return { writeKey, readKeys };
}
export function encryptSecretStringV1(value, key, randomBytes) {
    if (key.length !== tweetnacl.secretbox.keyLength) {
        throw new Error(`Invalid secretbox key length: ${key.length}`);
    }
    const nonce = randomBytes(tweetnacl.secretbox.nonceLength);
    if (nonce.length !== tweetnacl.secretbox.nonceLength) {
        throw new Error(`Invalid nonce length: ${nonce.length}`);
    }
    const message = new TextEncoder().encode(value);
    const boxed = tweetnacl.secretbox(message, nonce, key);
    const combined = new Uint8Array(nonce.length + boxed.length);
    combined.set(nonce, 0);
    combined.set(boxed, nonce.length);
    return { t: 'enc-v1', c: encodeBase64(combined, 'base64') };
}
export function decryptSecretStringV1(enc, key) {
    try {
        const combined = decodeBase64(enc.c, 'base64');
        if (combined.length < tweetnacl.secretbox.nonceLength + 16)
            return null;
        const nonce = combined.slice(0, tweetnacl.secretbox.nonceLength);
        const boxed = combined.slice(tweetnacl.secretbox.nonceLength);
        const opened = tweetnacl.secretbox.open(boxed, nonce, key);
        if (!opened)
            return null;
        return new TextDecoder().decode(opened);
    }
    catch {
        return null;
    }
}
export function decryptSecretStringWithKeysV1(enc, keys) {
    for (const key of keys) {
        if (!key)
            continue;
        const opened = decryptSecretStringV1(enc, key);
        if (opened !== null) {
            return opened;
        }
    }
    return null;
}
export function decryptSecretValueV1(input, key) {
    return decryptSecretValueWithKeysV1(input, key ? [key] : []);
}
export function decryptSecretValueWithKeysV1(input, keys) {
    if (!input)
        return null;
    const plaintext = typeof input.value === 'string' ? input.value : null;
    if (plaintext !== null && plaintext.trim().length > 0)
        return plaintext;
    if (!input.encryptedValue)
        return null;
    return decryptSecretStringWithKeysV1(input.encryptedValue, keys);
}
function isPlainObject(value) {
    if (!value || typeof value !== 'object')
        return false;
    if (Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
export function sealSecretsDeepV1(input, key, randomBytes) {
    if (!key)
        return input;
    if (Array.isArray(input)) {
        let out = null;
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const sealed = sealSecretsDeepV1(item, key, randomBytes);
            if (out) {
                out[i] = sealed;
                continue;
            }
            if (sealed !== item) {
                out = new Array(input.length);
                for (let j = 0; j < i; j++)
                    out[j] = input[j];
                out[i] = sealed;
            }
        }
        return (out ? out : input);
    }
    if (!isPlainObject(input))
        return input;
    if (input._isSecretValue === true) {
        const rawValue = typeof input.value === 'string' ? String(input.value) : null;
        if (rawValue !== null && rawValue.trim().length > 0) {
            const encryptedValue = encryptSecretStringV1(rawValue, key, randomBytes);
            const { value: _dropped, ...rest } = input;
            return { ...rest, encryptedValue };
        }
        if (rawValue !== null) {
            const { value: _dropped, ...rest } = input;
            return rest;
        }
        return input;
    }
    let out = input;
    for (const [k, v] of Object.entries(input)) {
        const sealedChild = sealSecretsDeepV1(v, key, randomBytes);
        if (sealedChild !== v) {
            if (out === input)
                out = { ...input };
            out[k] = sealedChild;
        }
    }
    return out;
}
export function unsealSecretsDeepV1(input, key) {
    return unsealSecretsDeepWithKeysV1(input, key ? [key] : []);
}
export function unsealSecretsDeepWithKeysV1(input, keys) {
    if (keys.length === 0)
        return input;
    if (Array.isArray(input)) {
        let out = null;
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const unsealed = unsealSecretsDeepWithKeysV1(item, keys);
            if (out) {
                out[i] = unsealed;
                continue;
            }
            if (unsealed !== item) {
                out = new Array(input.length);
                for (let j = 0; j < i; j++)
                    out[j] = input[j];
                out[i] = unsealed;
            }
        }
        return (out ? out : input);
    }
    if (!isPlainObject(input))
        return input;
    if (input._isSecretValue === true) {
        const hasPlain = typeof input.value === 'string' && String(input.value).trim().length > 0;
        if (hasPlain) {
            if (input.encryptedValue === undefined)
                return input;
            const { encryptedValue: _dropped, ...rest } = input;
            return rest;
        }
        const encryptedValue = input.encryptedValue;
        const parsed = EncryptedStringV1Schema.safeParse(encryptedValue);
        if (!parsed.success)
            return input;
        const opened = decryptSecretStringWithKeysV1(parsed.data, keys);
        if (!opened)
            return input;
        const { encryptedValue: _dropped, ...rest } = input;
        return { ...rest, value: opened };
    }
    let out = input;
    for (const [k, v] of Object.entries(input)) {
        const unsealedChild = unsealSecretsDeepWithKeysV1(v, keys);
        if (unsealedChild !== v) {
            if (out === input)
                out = { ...input };
            out[k] = unsealedChild;
        }
    }
    return out;
}
export function resealSecretsDeepV1(input, params) {
    if (Array.isArray(input)) {
        let out = null;
        let changed = false;
        for (let index = 0; index < input.length; index += 1) {
            const child = input[index];
            const resealed = resealSecretsDeepV1(child, params);
            if (resealed.changed) {
                changed = true;
            }
            if (out) {
                out[index] = resealed.value;
                continue;
            }
            if (resealed.value !== child) {
                out = new Array(input.length);
                for (let copyIndex = 0; copyIndex < index; copyIndex += 1) {
                    out[copyIndex] = input[copyIndex];
                }
                out[index] = resealed.value;
            }
        }
        return { value: (out ? out : input), changed };
    }
    if (!isPlainObject(input)) {
        return { value: input, changed: false };
    }
    if (input._isSecretValue === true) {
        const plaintext = typeof input.value === 'string' ? String(input.value).trim() : '';
        if (plaintext.length > 0) {
            const { value: _dropped, ...rest } = input;
            return {
                value: {
                    ...rest,
                    encryptedValue: encryptSecretStringV1(plaintext, params.writeKey, params.randomBytes),
                },
                changed: true,
            };
        }
        const parsed = EncryptedStringV1Schema.safeParse(input.encryptedValue);
        if (!parsed.success) {
            return { value: input, changed: false };
        }
        if (decryptSecretStringV1(parsed.data, params.writeKey) !== null) {
            return { value: input, changed: false };
        }
        const opened = decryptSecretStringWithKeysV1(parsed.data, params.readKeys);
        if (opened === null) {
            return { value: input, changed: false };
        }
        return {
            value: {
                ...input,
                encryptedValue: encryptSecretStringV1(opened, params.writeKey, params.randomBytes),
            },
            changed: true,
        };
    }
    let out = input;
    let changed = false;
    for (const [key, child] of Object.entries(input)) {
        const resealed = resealSecretsDeepV1(child, params);
        if (resealed.changed) {
            changed = true;
        }
        if (resealed.value !== child) {
            if (out === input)
                out = { ...input };
            out[key] = resealed.value;
        }
    }
    return { value: out, changed };
}
//# sourceMappingURL=settingsSecretStringsV1.js.map