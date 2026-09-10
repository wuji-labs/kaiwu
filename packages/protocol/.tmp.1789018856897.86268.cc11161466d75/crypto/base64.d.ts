export type Base64Variant = 'base64' | 'base64url';
export declare function readCanonicalPaddedBase64DecodedLength(input: string): number | null;
export declare function encodeBase64(bytes: Uint8Array, variant?: Base64Variant): string;
export declare function decodeBase64(base64: string, variant?: Base64Variant): Uint8Array;
//# sourceMappingURL=base64.d.ts.map