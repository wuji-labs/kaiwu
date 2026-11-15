import { describe, expect, it } from 'vitest';

import { buildOutgoingMessageMeta } from '@/sync/domains/messages/messageMeta';
import { settingsParse } from '@/sync/domains/settings/settings';
import { addProviderMessageMetaExtras } from '@/sync/domains/messages/messageMetaProviders';

describe('addProviderMessageMetaExtras', () => {
    it('returns the original meta when the provider adds no extras', () => {
        const base = buildOutgoingMessageMeta({
            sentFrom: 'e2e',
            permissionMode: 'default',
            appendSystemPrompt: 'SYSTEM',
        });

        const merged = addProviderMessageMetaExtras({
            meta: base,
            agentId: 'gemini',
            settings: {},
            session: { id: 's1' },
        });

        expect(merged).toEqual(base);
    });

    it('merges provider plugin meta extras for Claude sessions', () => {
        const settings = settingsParse({
            claudeRemoteAgentSdkEnabled: true,
            claudeRemoteSettingSourcesV2: ['project'],
            claudeLocalPermissionBridgeEnabled: true,
            claudeUnifiedTerminalResumeChoice: 'resume_full_session',
        });

        const base = buildOutgoingMessageMeta({
            sentFrom: 'e2e',
            permissionMode: 'default',
            appendSystemPrompt: 'SYSTEM',
        });

        const merged = addProviderMessageMetaExtras({
            meta: base,
            agentId: 'claude',
            settings,
            session: { id: 's1' },
        });

        expect((merged as any).claudeRemoteAgentSdkEnabled).toBe(true);
        expect((merged as any).claudeRemoteSettingSources).toBe('project');
        expect((merged as any).claudeRemoteSettingSourcesV2).toEqual(['project']);
        expect((merged as any).claudeLocalPermissionBridgeEnabled).toBe(true);
        expect((merged as any).claudeUnifiedTerminalResumeChoice).toBe('resume_full_session');
    });

    it('drops oversized provider advanced options JSON payloads before meta merge', () => {
        const hugeJson = JSON.stringify({
            tools: { note: 'x'.repeat(32_000) },
        });
        const settings = settingsParse({
            claudeRemoteAdvancedOptionsJson: hugeJson,
        });

        const base = buildOutgoingMessageMeta({
            sentFrom: 'e2e',
            permissionMode: 'default',
            appendSystemPrompt: 'SYSTEM',
        });

        const merged = addProviderMessageMetaExtras({
            meta: base,
            agentId: 'claude',
            settings,
            session: { id: 's1' },
        });

        expect((merged as any).claudeRemoteAdvancedOptionsJson).toBe('');
    });
});
