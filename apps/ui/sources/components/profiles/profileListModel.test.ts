import { describe, expect, it, vi } from 'vitest';
import type { ProfileCompatibilitySummary } from '@/sync/domains/profiles/profileCompatibility';
import { getProfileBackendSubtitle, getProfileSubtitle, type ProfileListStrings } from '@/components/profiles/profileListModel';
import type { AgentId } from '@/agents/catalog/catalog';
import { installProfilesCommonModuleMocks } from './profilesTestHelpers';

installProfilesCommonModuleMocks();

describe('profileListModel', () => {
    const strings: ProfileListStrings = {
        builtInLabel: 'Built-in',
        customLabel: 'Custom',
        agentLabelById: {
            claude: 'Claude',
            codex: 'Codex',
            gemini: 'Gemini',
            customAcp: 'Custom ACP',
        } as Record<AgentId, string>,
    };

    function buildProfile(params: {
        isBuiltIn?: boolean;
        compatibility?: Record<string, boolean>;
        compatibilityByTargetKey?: Record<string, boolean>;
    }): ProfileCompatibilitySummary {
        return {
            isBuiltIn: params.isBuiltIn ?? false,
            compatibility: params.compatibility ?? {},
            compatibilityByTargetKey: params.compatibilityByTargetKey,
        };
    }

    it('builds backend subtitle for enabled compatible agents', () => {
        const profile = buildProfile({
            compatibility: { claude: true, codex: true, gemini: true, customAcp: false },
        });
        expect(getProfileBackendSubtitle({ profile, enabledAgentIds: ['claude', 'codex'], strings })).toBe('Claude • Codex');
    });

    it('skips disabled agents even if compatible', () => {
        const profile = buildProfile({
            compatibility: { claude: true, codex: true, gemini: true, customAcp: false },
        });
        expect(getProfileBackendSubtitle({ profile, enabledAgentIds: ['claude', 'gemini'], strings })).toBe('Claude • Gemini');
    });

    it('returns empty backend subtitle when no enabled compatible agents exist', () => {
        const profile = buildProfile({
            compatibility: { claude: false, codex: false, gemini: false, customAcp: false },
        });
        expect(getProfileBackendSubtitle({ profile, enabledAgentIds: ['claude', 'codex', 'customAcp'], strings })).toBe('');
    });

    it('ignores compatible agents when display labels are missing', () => {
        const profile = buildProfile({
            compatibility: { customAcp: true },
        });
        const stringsWithMissingCustomAcp = {
            ...strings,
            agentLabelById: { ...strings.agentLabelById, customAcp: '' },
        };
        expect(getProfileBackendSubtitle({ profile, enabledAgentIds: ['customAcp'], strings: stringsWithMissingCustomAcp })).toBe('');
    });

    it('builds built-in subtitle with backend', () => {
        const profile = buildProfile({
            isBuiltIn: true,
            compatibility: { claude: true, codex: false, gemini: false, customAcp: false },
        });
        expect(getProfileSubtitle({ profile, enabledAgentIds: ['claude', 'codex'], strings })).toBe('Built-in · Claude');
    });

    it('includes configured ACP backend titles when profile compatibility is target-keyed', () => {
        const profile = {
            ...buildProfile({}),
            compatibilityByTargetKey: {
                'acpBackend:custom-backend': true,
                'agent:claude': false,
            },
        } satisfies ProfileCompatibilitySummary;

        expect(getProfileSubtitle({
            profile,
            enabledAgentIds: ['claude', 'customAcp'],
            backendEntries: [
                { targetKey: 'agent:claude', title: 'Claude' },
                { targetKey: 'acpBackend:custom-backend', title: 'Custom Backend' },
            ],
            strings,
        })).toBe('Custom · Custom Backend');
    });

    it('builds custom subtitle without backend', () => {
        const profile = buildProfile({
            compatibility: { claude: false, codex: false, opencode: false, gemini: false, auggie: false, qwen: false, kimi: false },
        });
        expect(getProfileSubtitle({ profile, enabledAgentIds: ['claude', 'codex', 'gemini'], strings })).toBe('Custom');
    });
});
