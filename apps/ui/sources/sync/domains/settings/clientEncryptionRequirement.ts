import {
    ClientEncryptionRequirementSchema,
    combineClientEncryptionRequirements,
    isAccountEncryptionModeAllowedByClientRequirement,
    isSessionEncryptionModeAllowedByClientRequirement,
    type ClientEncryptionRequirement,
    type SessionEncryptionMode,
} from '@happier-dev/protocol';

type RequirementSettings = Readonly<{
    clientEncryptionRequirementV1?: unknown;
    clientEncryptionRequirementLocalV1?: unknown;
}>;

export function resolveUiClientEncryptionRequirement(params: Readonly<{
    syncedSettings: RequirementSettings;
    localSettings: RequirementSettings;
}>): ClientEncryptionRequirement {
    return combineClientEncryptionRequirements(
        ClientEncryptionRequirementSchema.parse(params.syncedSettings.clientEncryptionRequirementV1),
        ClientEncryptionRequirementSchema.parse(params.localSettings.clientEncryptionRequirementLocalV1),
    );
}

export function assertUiAccountEncryptionModeAllowed(params: Readonly<{
    mode: 'e2ee' | 'plain';
    syncedSettings: RequirementSettings;
    localSettings: RequirementSettings;
}>): void {
    const requirement = resolveUiClientEncryptionRequirement(params);
    if (isAccountEncryptionModeAllowedByClientRequirement(requirement, params.mode)) return;
    throw Object.assign(
        new Error('This Happier client requires end-to-end encryption, but the Account settings are stored as plaintext.'),
        { code: 'CLIENT_E2EE_REQUIRED' },
    );
}

export function isUiSessionEncryptionModeAllowed(params: Readonly<{
    mode: SessionEncryptionMode;
    requirement: ClientEncryptionRequirement;
}>): boolean {
    return isSessionEncryptionModeAllowedByClientRequirement(params.requirement, params.mode);
}

export function assertUiSessionEncryptionModeAllowed(params: Readonly<{
    mode: SessionEncryptionMode;
    requirement: ClientEncryptionRequirement;
}>): void {
    if (isUiSessionEncryptionModeAllowed(params)) return;
    throw Object.assign(
        new Error('This Happier client requires end-to-end encryption and will not write to a plaintext session.'),
        { code: 'CLIENT_E2EE_REQUIRED' },
    );
}
