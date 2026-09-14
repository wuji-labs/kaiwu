import {
    ClientEncryptionRequirementSchema,
    defineSettingDefinitions,
} from '@happier-dev/protocol';

export const ACCOUNT_ENCRYPTION_SETTING_DEFINITIONS = defineSettingDefinitions({
    clientEncryptionRequirementV1: {
        schema: ClientEncryptionRequirementSchema,
        default: 'follow_account',
        description: 'Synced client preference that refuses plaintext Account and Session storage',
        storageScope: 'account',
        analytics: { trackCurrentState: true, trackChanges: true, valueKind: 'enum', privacy: 'safe', identityScope: 'person' },
    },
    clientEncryptionRequirementLocalV1: {
        schema: ClientEncryptionRequirementSchema,
        default: 'follow_account',
        description: 'Trusted device-local pin that refuses plaintext Account and Session storage',
        storageScope: 'local',
    },
});
