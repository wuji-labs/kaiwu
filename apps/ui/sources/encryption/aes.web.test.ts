import { describe, expect, it, vi } from 'vitest';

import { encodeBase64 } from '@/encryption/base64';

describe('aes.web', () => {
    it('encrypts and decrypts large payloads without stack overflow', async () => {
        const { encryptAESGCMString, decryptAESGCMString } = await import('./aes.web');

        const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const keyB64 = encodeBase64(keyBytes, 'base64');

        const plaintext = 'a'.repeat(400_000);
        const encrypted = await encryptAESGCMString(plaintext, keyB64);
        expect(typeof encrypted).toBe('string');

        const decrypted = await decryptAESGCMString(encrypted, keyB64);
        expect(decrypted).toBe(plaintext);
    });

    it('imports each AES key once and reuses it across decrypts', async () => {
        const { encryptAESGCMString, decryptAESGCMString } = await import('./aes.web');
        const keyB64 = encodeBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)), 'base64');
        const otherKeyB64 = encodeBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)), 'base64');
        const encrypted = await encryptAESGCMString('payload', keyB64);
        const importKey = vi.spyOn(globalThis.crypto.subtle, 'importKey');
        try {
            for (let index = 0; index < 20; index += 1) {
                expect(await decryptAESGCMString(encrypted, keyB64)).toBe('payload');
            }
            // A different key is a different import; a wrong key still fails closed.
            expect(await decryptAESGCMString(encrypted, otherKeyB64)).toBeNull();
            expect(importKey.mock.calls.length).toBeLessThanOrEqual(2);
        } finally {
            importKey.mockRestore();
        }
    });
});
