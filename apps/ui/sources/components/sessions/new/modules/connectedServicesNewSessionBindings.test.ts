import { describe, expect, it } from 'vitest';

import { AGENTS_CORE } from '@happier-dev/agents';
import {
    buildConnectedServiceAccountGroupOptionsByServiceId,
    buildConnectedServiceProfileOptionsByServiceId,
    buildConnectedServicesBindingsPayload,
    type ConnectedServicesProfileOptionsByServiceId,
} from './connectedServicesNewSessionBindings';

const profileOptionsByServiceId: ConnectedServicesProfileOptionsByServiceId = {
    'openai-codex': [
        { profileId: 'work', status: 'connected', providerEmail: 'work@example.com' },
        { profileId: 'backup', status: 'connected', providerEmail: 'backup@example.com' },
    ],
};

describe('buildConnectedServicesBindingsPayload', () => {
    it('emits a group binding without using the stored fallback profile id', () => {
        const payload = buildConnectedServicesBindingsPayload({
            supportedConnectedServiceIds: ['openai-codex'],
            connectedServiceProfileOptionsByServiceId: profileOptionsByServiceId,
            accountGroupsFeatureEnabled: true,
            connectedServiceAccountGroupOptionsByServiceId: {
                'openai-codex': [{
                    groupId: 'codex-main',
                    label: 'Codex main',
                    activeProfileId: 'backup',
                    enabledMemberCount: 2,
                    autoSwitch: true,
                    status: 'ready',
                }],
            },
            connectedServicesBindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                    profileId: 'work',
                },
            },
            defaultProfileByServiceId: {},
        });

        expect(payload).toEqual({
            v: 1,
            bindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                },
            },
        });
    });

    it('preserves a viable group binding when the active member needs reauth but another member is connected', () => {
        const payload = buildConnectedServicesBindingsPayload({
            supportedConnectedServiceIds: ['openai-codex'],
            connectedServiceProfileOptionsByServiceId: {
                'openai-codex': [
                    { profileId: 'work', status: 'needs_reauth', providerEmail: 'work@example.com' },
                    { profileId: 'backup', status: 'connected', providerEmail: 'backup@example.com' },
                ],
            },
            accountGroupsFeatureEnabled: true,
            connectedServiceAccountGroupOptionsByServiceId: {
                'openai-codex': [{
                    groupId: 'codex-main',
                    label: 'Codex main',
                    activeProfileId: 'work',
                    memberProfileIds: ['work', 'backup'],
                    enabledMemberCount: 2,
                    autoSwitch: true,
                    status: 'ready',
                }],
            },
            connectedServicesBindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                    profileId: 'work',
                },
            },
            defaultProfileByServiceId: {},
        });

        expect(payload).toEqual({
            v: 1,
            bindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                },
            },
        });
    });

    it('preserves a missing explicit group binding instead of silently selecting native auth', () => {
        const payload = buildConnectedServicesBindingsPayload({
            supportedConnectedServiceIds: ['openai-codex'],
            connectedServiceProfileOptionsByServiceId: profileOptionsByServiceId,
            accountGroupsFeatureEnabled: true,
            connectedServiceAccountGroupOptionsByServiceId: {
                'openai-codex': [{
                    groupId: 'codex-main',
                    label: 'Codex main',
                    activeProfileId: 'work',
                    enabledMemberCount: 2,
                    autoSwitch: true,
                    status: 'ready',
                }],
            },
            connectedServicesBindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'missing-group',
                    profileId: 'missing',
                },
            },
            defaultProfileByServiceId: { 'openai-codex': 'backup' },
        });

        expect(payload).toEqual({
            v: 1,
            bindingsByServiceId: {
                'openai-codex': { source: 'connected', selection: 'group', groupId: 'missing-group' },
            },
        });
    });

    it('preserves explicit group intent when the target server cannot currently use account groups', () => {
        const payload = buildConnectedServicesBindingsPayload({
            supportedConnectedServiceIds: ['openai-codex'],
            connectedServiceProfileOptionsByServiceId: profileOptionsByServiceId,
            accountGroupsFeatureEnabled: false,
            connectedServiceAccountGroupOptionsByServiceId: {
                'openai-codex': [{
                    groupId: 'codex-main',
                    label: 'Codex main',
                    activeProfileId: 'work',
                    enabledMemberCount: 2,
                    autoSwitch: true,
                    status: 'ready',
                }],
            },
            connectedServicesBindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                    profileId: 'work',
                },
            },
            defaultProfileByServiceId: {},
        });

        expect(payload).toEqual({
            v: 1,
            bindingsByServiceId: {
                'openai-codex': { source: 'connected', selection: 'group', groupId: 'codex-main' },
            },
        });
    });

    it('preserves explicit group intent when the target runtime cannot currently switch account groups', () => {
        const payload = buildConnectedServicesBindingsPayload({
            supportedConnectedServiceIds: ['openai-codex'],
            connectedServiceProfileOptionsByServiceId: profileOptionsByServiceId,
            accountGroupsFeatureEnabled: true,
            accountGroupSwitchingEnabled: false,
            connectedServiceAccountGroupOptionsByServiceId: {
                'openai-codex': [{
                    groupId: 'codex-main',
                    label: 'Codex main',
                    activeProfileId: 'work',
                    enabledMemberCount: 2,
                    autoSwitch: true,
                    status: 'ready',
                }],
            },
            connectedServicesBindingsByServiceId: {
                'openai-codex': {
                    source: 'connected',
                    selection: 'group',
                    groupId: 'codex-main',
                    profileId: 'work',
                },
            },
            defaultProfileByServiceId: {},
        });

        expect(payload).toEqual({
            v: 1,
            bindingsByServiceId: {
                'openai-codex': { source: 'connected', selection: 'group', groupId: 'codex-main' },
            },
        });
    });
});

describe('buildConnectedServiceProfileOptionsByServiceId', () => {
    it('preserves unsupported-kind projection and UI subtitle keys for a fixed agent fixture', () => {
        const options = buildConnectedServiceProfileOptionsByServiceId({
            accountProfileConnectedServicesV2: [{
                serviceId: 'claude-subscription',
                profiles: [
                    {
                        profileId: 'oauth-not-supported',
                        status: 'connected',
                        kind: 'oauth',
                        providerEmail: 'oauth@example.com',
                    },
                ],
            }],
            agentCore: {
                id: 'test-agent',
                connectedServices: {
                    supportedServiceIds: ['claude-subscription'],
                    supportedKindsByServiceId: {
                        'claude-subscription': ['token'],
                    },
                },
            },
            supportedConnectedServiceIds: ['claude-subscription'],
            labelsByKey: {},
        });

        expect(options['claude-subscription']).toEqual([
            expect.objectContaining({
                profileId: 'oauth-not-supported',
                status: 'unsupported_kind',
                kind: 'oauth',
                unsupportedSubtitleKey: 'connectedServices.detail.connectSetupTokenSubtitle',
            }),
        ]);
    });
});

describe('buildConnectedServiceAccountGroupOptionsByServiceId', () => {
    it('does not expose account-group options when account groups are disabled', () => {
        const options = buildConnectedServiceAccountGroupOptionsByServiceId({
            accountGroupsFeatureEnabled: false,
            accountProfileConnectedServicesV2: [{
                serviceId: 'openai-codex',
                groups: [{
                    groupId: 'codex-main',
                    displayName: 'Codex main',
                    activeProfileId: 'work',
                    members: [{ profileId: 'work', enabled: true }],
                }],
            }],
            supportedConnectedServiceIds: ['openai-codex'],
        });

        expect(options).toEqual({});
    });

    it('counts profile ids projected by the account profile API as enabled group members', () => {
        const options = buildConnectedServiceAccountGroupOptionsByServiceId({
            accountGroupsFeatureEnabled: true,
            accountProfileConnectedServicesV2: [{
                serviceId: 'openai-codex',
                groups: [{
                    groupId: 'codex-main',
                    displayName: 'Codex main',
                    activeProfileId: 'work',
                    memberProfileIds: ['work', 'backup'],
                }],
            }],
            supportedConnectedServiceIds: ['openai-codex'],
        });

        expect(options['openai-codex']).toEqual([expect.objectContaining({
            groupId: 'codex-main',
            enabledMemberCount: 2,
            status: 'ready',
        })]);
    });

    it('prefers state.status when projecting exhausted account groups', () => {
        const options = buildConnectedServiceAccountGroupOptionsByServiceId({
            accountGroupsFeatureEnabled: true,
            accountProfileConnectedServicesV2: [{
                serviceId: 'openai-codex',
                groups: [{
                    groupId: 'codex-main',
                    displayName: 'Codex main',
                    activeProfileId: 'work',
                    memberProfileIds: ['work', 'backup'],
                    state: {
                        status: 'exhausted',
                    },
                }],
            }],
            supportedConnectedServiceIds: ['openai-codex'],
        });

        expect(options['openai-codex']).toEqual([expect.objectContaining({
            groupId: 'codex-main',
            enabledMemberCount: 2,
            status: 'exhausted',
        })]);
    });
});
