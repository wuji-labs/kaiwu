const VERSION_BYTE = 0;
const AES_GCM_IV_BYTES = 12;
const SERIALIZED_JSON_VALUE_SENTINEL = '__happierSerializedJsonValueV1';

function decodeBase64(value) {
  const compact = String(value ?? '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = compact + '='.repeat((4 - (compact.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importAesGcmKey(keyBase64) {
  return await crypto.subtle.importKey('raw', decodeBase64(keyBase64), { name: 'AES-GCM' }, false, ['decrypt']);
}

function parseSerializedJsonValue(serialized) {
  if (serialized === 'undefined') return undefined;
  const parsed = JSON.parse(serialized);
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (parsed[SERIALIZED_JSON_VALUE_SENTINEL] !== true) return parsed;
  if (parsed.type === 'undefined') return undefined;
  if (parsed.type === 'json' && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
    return parsed.value;
  }
  return parsed;
}

async function decryptAesGcmJsonItem(item, key) {
  try {
    const payload = decodeBase64(item);
    if (payload.length < 1 + AES_GCM_IV_BYTES || payload[0] !== VERSION_BYTE) return null;
    const iv = payload.slice(1, 1 + AES_GCM_IV_BYTES);
    const ciphertext = payload.slice(1 + AES_GCM_IV_BYTES);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const serialized = new TextDecoder().decode(new Uint8Array(plaintext)).trim();
    return parseSerializedJsonValue(serialized);
  } catch {
    return null;
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'decryptAesGcmJsonBatch' || !Array.isArray(message.items)) {
    return;
  }

  try {
    const key = await importAesGcmKey(message.keyBase64);
    const items = [];
    for (const item of message.items) {
      items.push(await decryptAesGcmJsonItem(item, key));
    }
    self.postMessage({ id: message.id, status: 'ok', items });
  } catch {
    self.postMessage({ id: message.id, status: 'error', items: [] });
  }
};
