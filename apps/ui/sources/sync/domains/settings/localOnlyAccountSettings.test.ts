import { describe, expect, it } from 'vitest';

import { settingsParse } from '@/sync/domains/settings/settings';
import { pickLocalOnlyAccountSettings, stripLocalOnlyAccountSettings } from '@/sync/domains/settings/localOnlyAccountSettings';
import { ACCOUNT_SESSION_CREATION_SETTING_DEFINITIONS } from '@/sync/domains/settings/registry/account/accountSessionCreationSettingDefinitions';
import { ACCOUNT_ENCRYPTION_SETTING_DEFINITIONS } from '@/sync/domains/settings/registry/account/accountEncryptionSettingDefinitions';

describe('localOnlyAccountSettings', () => {
    it('strips UI-local lastUsedAgent from server-synced settings', () => {
        const stripped = stripLocalOnlyAccountSettings({
            lastUsedAgent: 'codex',
            lastUsedBackendTarget: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
            lastNewSessionAgentPickerViewV1: { kind: 'favoriteModels' },
            clientEncryptionRequirementLocalV1: 'require_e2ee',
            clientEncryptionRequirementV1: 'require_e2ee',
            analyticsOptOut: true,
        } as any);

        expect(stripped).toEqual({
            clientEncryptionRequirementV1: 'require_e2ee',
            analyticsOptOut: true,
        });
    });

    it('picks UI-local lastUsedAgent for merge overlays', () => {
        const settings = settingsParse({
            lastUsedAgent: 'codex',
            lastUsedBackendTarget: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
            lastNewSessionAgentPickerViewV1: { kind: 'favoriteModels' },
            clientEncryptionRequirementLocalV1: 'require_e2ee',
        });
        const picked = pickLocalOnlyAccountSettings(settings);
        expect(picked).toMatchObject({
            lastUsedAgent: 'codex',
            lastUsedBackendTarget: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
            lastNewSessionAgentPickerViewV1: { kind: 'favoriteModels' },
            clientEncryptionRequirementLocalV1: 'require_e2ee',
        });
    });

    it('declares last-used session creation settings as local-only in the canonical registry metadata', () => {
        expect(ACCOUNT_SESSION_CREATION_SETTING_DEFINITIONS.lastUsedAgent.storageScope).toBe('local');
        expect(ACCOUNT_SESSION_CREATION_SETTING_DEFINITIONS.lastUsedBackendTarget.storageScope).toBe('local');
        expect(ACCOUNT_SESSION_CREATION_SETTING_DEFINITIONS.lastNewSessionAgentPickerViewV1.storageScope).toBe('local');
        expect(ACCOUNT_ENCRYPTION_SETTING_DEFINITIONS.clientEncryptionRequirementLocalV1.storageScope).toBe('local');
        expect(ACCOUNT_ENCRYPTION_SETTING_DEFINITIONS.clientEncryptionRequirementV1.storageScope).toBe('account');
    });
});
