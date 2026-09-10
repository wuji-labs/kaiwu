export declare const PUBLIC_SHARE_DATA_ENCRYPTION_KEY_BYTES = 32;
export declare const PUBLIC_SHARE_ENCRYPTED_DATA_KEY_LEGACY_V0_BYTES: number;
export declare const PUBLIC_SHARE_ENCRYPTED_DATA_KEY_CURRENT_V0_BYTES: number;
export type PublicShareEncryptedDataKeyEnvelopeV0 = Readonly<{
    format: 'legacy-json' | 'serialized-json-v1';
    encryptedDataKey: Uint8Array<ArrayBuffer>;
}>;
/**
 * Parses the public-share v0 SecretBox envelope structurally.
 *
 * The token-derived SecretBox key is intentionally unavailable to the server,
 * so authenticity is verified by the public viewer during decryption. The
 * server can still fail closed on every wire shape except the two deployed
 * fixed-length encodings for a 32-byte data key.
 */
export declare function parsePublicShareEncryptedDataKeyEnvelopeV0(bytes: Uint8Array): PublicShareEncryptedDataKeyEnvelopeV0 | null;
//# sourceMappingURL=publicShareEncryptedDataKeyEnvelopeV0.d.ts.map