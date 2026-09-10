import { z } from 'zod';
export const EncryptionStoragePolicySchema = z.enum(['required_e2ee', 'optional', 'plaintext_only']);
export const AccountEncryptionModeSchema = z.enum(['e2ee', 'plain']);
export const PlainAccountAtRestPolicySchema = z.enum(['none', 'server_sealed']);
export const EncryptionCapabilitiesSchema = z.object({
    storagePolicy: EncryptionStoragePolicySchema,
    allowAccountOptOut: z.boolean(),
    defaultAccountMode: AccountEncryptionModeSchema,
    plainAccountSettingsAtRest: PlainAccountAtRestPolicySchema.optional().default('server_sealed'),
    plainAccountCredentialsAtRest: PlainAccountAtRestPolicySchema.optional().default('server_sealed'),
});
export const DEFAULT_ENCRYPTION_CAPABILITIES = {
    storagePolicy: 'required_e2ee',
    allowAccountOptOut: false,
    defaultAccountMode: 'e2ee',
    plainAccountSettingsAtRest: 'server_sealed',
    plainAccountCredentialsAtRest: 'server_sealed',
};
//# sourceMappingURL=encryptionCapabilities.js.map