import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SESSION_AGENT_SPAWN_POLICY_V1,
} from '@happier-dev/protocol';
import { settingsDefaults, settingsParse } from '@/sync/domains/settings/settings';

import { ACCOUNT_ACTIONS_SETTING_DEFINITIONS } from './accountActionsSettingDefinitions';

describe('account action setting definitions', () => {
    it('registers the session-agent spawn policy as an account setting with default-open values', () => {
        const definition = ACCOUNT_ACTIONS_SETTING_DEFINITIONS.sessionAgentSpawnPolicyV1;

        expect(definition.default).toEqual(DEFAULT_SESSION_AGENT_SPAWN_POLICY_V1);
        expect(settingsDefaults.sessionAgentSpawnPolicyV1).toEqual(DEFAULT_SESSION_AGENT_SPAWN_POLICY_V1);
        expect(settingsParse({
            schemaVersion: 9,
            sessionAgentSpawnPolicyV1: {
                v: 1,
                allowEnvironmentVariables: false,
                permissionCeiling: 'default',
            },
        }).sessionAgentSpawnPolicyV1).toMatchObject({
            allowEnvironmentVariables: false,
            allowModelOverride: true,
            permissionCeiling: 'default',
        });
    });
});
