export type AccountScopedBlobKind = 'account_settings' | 'automation_template_payload' | 'connected_service_credential' | 'connected_service_quota_snapshot' | 'provider_account_usage_snapshot' | 'session_organization_display' | 'session_first_intent' | 'session_respawn_environment' | 'action_operation_snapshot' | 'account_session_draft_private_payload';
export type AccountScopedCryptoMaterial = Readonly<{
    type: 'legacy';
    secret: Uint8Array;
}> | Readonly<{
    type: 'dataKey';
    machineKey: Uint8Array;
}>;
export type AccountScopedCiphertextFormat = 'account_scoped_v1' | 'legacy_secretbox';
export type AccountScopedOpenResult = Readonly<{
    format: AccountScopedCiphertextFormat;
    value: unknown;
}> | null;
export declare function accountScopedCiphertextBase64LengthForPlaintextBytes(plaintextBytes: number): number;
export declare function deriveAccountMachineKeyFromRecoverySecret(recoverySecret: Uint8Array): Uint8Array;
export declare function sealAccountScopedBlobCiphertext(params: {
    kind: AccountScopedBlobKind;
    material: AccountScopedCryptoMaterial;
    payload: unknown;
    randomBytes: (length: number) => Uint8Array;
}): string;
export declare function openAccountScopedBlobCiphertext(params: {
    kind: AccountScopedBlobKind;
    material: AccountScopedCryptoMaterial;
    ciphertext: string;
}): AccountScopedOpenResult;
//# sourceMappingURL=accountScopedCipher.d.ts.map