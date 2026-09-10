import { z } from 'zod';
import { type AccountScopedCryptoMaterial } from './accountScopedCipher.js';
export declare const EncryptedStringV1Schema: any;
export type EncryptedStringV1 = z.infer<typeof EncryptedStringV1Schema>;
export declare const SecretStringV1Schema: any;
export type SecretStringV1 = z.infer<typeof SecretStringV1Schema>;
export type SettingsSecretsKeySetV1 = Readonly<{
    writeKey: Uint8Array;
    readKeys: readonly Uint8Array[];
}>;
export type ResealSecretsDeepV1Result<T> = Readonly<{
    value: T;
    changed: boolean;
}>;
export declare function deriveSettingsSecretsKeyV1(masterSecret: Uint8Array): Uint8Array;
export declare function deriveSettingsSecretsKeySetV1(material: AccountScopedCryptoMaterial): SettingsSecretsKeySetV1;
export declare function encryptSecretStringV1(value: string, key: Uint8Array, randomBytes: (length: number) => Uint8Array): EncryptedStringV1;
export declare function decryptSecretStringV1(enc: EncryptedStringV1, key: Uint8Array): string | null;
export declare function decryptSecretStringWithKeysV1(enc: EncryptedStringV1, keys: ReadonlyArray<Uint8Array | null | undefined>): string | null;
export declare function decryptSecretValueV1(input: SecretStringV1 | null | undefined, key: Uint8Array | null): string | null;
export declare function decryptSecretValueWithKeysV1(input: SecretStringV1 | null | undefined, keys: ReadonlyArray<Uint8Array | null | undefined>): string | null;
export declare function sealSecretsDeepV1<T>(input: T, key: Uint8Array | null, randomBytes: (length: number) => Uint8Array): T;
export declare function unsealSecretsDeepV1<T>(input: T, key: Uint8Array | null): T;
export declare function unsealSecretsDeepWithKeysV1<T>(input: T, keys: ReadonlyArray<Uint8Array | null | undefined>): T;
export declare function resealSecretsDeepV1<T>(input: T, params: Readonly<{
    readKeys: ReadonlyArray<Uint8Array | null | undefined>;
    writeKey: Uint8Array;
    randomBytes: (length: number) => Uint8Array;
}>): ResealSecretsDeepV1Result<T>;
//# sourceMappingURL=settingsSecretStringsV1.d.ts.map