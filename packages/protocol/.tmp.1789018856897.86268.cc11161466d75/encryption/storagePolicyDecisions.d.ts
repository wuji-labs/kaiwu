import type { AccountEncryptionMode, EncryptionStoragePolicy } from '../features/payload/capabilities/encryptionCapabilities.js';
export type SessionEncryptionMode = AccountEncryptionMode;
export type SessionStoredContentKind = 'encrypted' | 'plain';
export declare function resolveStoredContentKindForSessionEncryptionMode(mode: SessionEncryptionMode): SessionStoredContentKind;
export declare function resolveEffectiveDefaultAccountEncryptionMode(storagePolicy: EncryptionStoragePolicy, configuredDefaultMode: AccountEncryptionMode): AccountEncryptionMode;
export declare function isSessionEncryptionModeAllowedByStoragePolicy(storagePolicy: EncryptionStoragePolicy, mode: SessionEncryptionMode): boolean;
export declare function isStoredContentKindAllowedForSessionByStoragePolicy(storagePolicy: EncryptionStoragePolicy, sessionEncryptionMode: SessionEncryptionMode, contentKind: SessionStoredContentKind): boolean;
//# sourceMappingURL=storagePolicyDecisions.d.ts.map