export declare const BOX_BUNDLE_PUBLIC_KEY_BYTES: number;
export declare const BOX_BUNDLE_NONCE_BYTES: number;
export declare const BOX_BUNDLE_MIN_BYTES: number;
export declare function deriveBoxSecretKeyFromSeed(seed: Uint8Array): Uint8Array;
export declare function deriveBoxPublicKeyFromSeed(seed: Uint8Array): Uint8Array;
export declare function sealBoxBundle(params: {
    plaintext: Uint8Array;
    recipientPublicKey: Uint8Array;
    randomBytes: (length: number) => Uint8Array;
}): Uint8Array;
export declare function openBoxBundle(params: {
    bundle: Uint8Array;
    recipientSecretKeyOrSeed: Uint8Array;
}): Uint8Array | null;
//# sourceMappingURL=boxBundle.d.ts.map