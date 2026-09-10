import { type AccountScopedCryptoMaterial, type AccountScopedOpenResult } from '../crypto/accountScopedCipher.js';
export declare function sealConnectedServiceCredentialCiphertext(params: Readonly<{
    material: AccountScopedCryptoMaterial;
    payload: unknown;
    randomBytes: (length: number) => Uint8Array;
}>): string;
export declare function openConnectedServiceCredentialCiphertext(params: Readonly<{
    material: AccountScopedCryptoMaterial;
    ciphertext: string;
}>): AccountScopedOpenResult;
export declare function openConnectedServiceQuotaSnapshotCiphertext(params: Readonly<{
    material: AccountScopedCryptoMaterial;
    ciphertext: string;
}>): AccountScopedOpenResult;
//# sourceMappingURL=connectedServiceCipher.d.ts.map