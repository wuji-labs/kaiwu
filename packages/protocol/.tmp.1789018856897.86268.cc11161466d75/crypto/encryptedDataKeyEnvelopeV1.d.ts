export declare const ENCRYPTED_DATA_KEY_ENVELOPE_V1_VERSION_BYTE = 0;
export declare function sealEncryptedDataKeyEnvelopeV1(params: {
    dataKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    randomBytes: (length: number) => Uint8Array;
}): Uint8Array;
export declare function openEncryptedDataKeyEnvelopeV1(params: {
    envelope: Uint8Array;
    recipientSecretKeyOrSeed: Uint8Array;
}): Uint8Array | null;
//# sourceMappingURL=encryptedDataKeyEnvelopeV1.d.ts.map