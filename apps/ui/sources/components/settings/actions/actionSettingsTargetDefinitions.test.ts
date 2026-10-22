import { describe, expect, it } from 'vitest';

import { getActionSpec } from '@happier-dev/protocol';
import { en } from '@/text/translations/en';

import { listActionSettingsTargetDefinitions } from './actionSettingsTargetDefinitions';

describe('action settings target definitions', () => {
    it('surfaces session-agent create-session support as distinct AI session and external MCP targets', () => {
        const spawnNewWithSessionAgentSurface = {
            ...getActionSpec('session.spawn_new'),
            surfaces: {
                ...getActionSpec('session.spawn_new').surfaces,
                session_agent: true,
            },
        };

        const targets = listActionSettingsTargetDefinitions(spawnNewWithSessionAgentSurface);
        const sessionAgentTarget = targets.find((target) => target.id === 'session_agent');
        const mcpTarget = targets.find((target) => target.id === 'mcp');

        expect(sessionAgentTarget).toMatchObject({
            id: 'session_agent',
            category: 'integrations',
        });
        expect(mcpTarget).toMatchObject({
            id: 'mcp',
            category: 'integrations',
        });
        expect(en.settingsActions.targets.session_agent.title).toBe('AI session');
        expect(en.settingsActions.targets.session_agent.subtitle).toContain('assistant running inside a Kaiwu session');
        expect(en.settingsActions.targets.mcp.subtitle).toContain('external MCP clients');
    });
});
