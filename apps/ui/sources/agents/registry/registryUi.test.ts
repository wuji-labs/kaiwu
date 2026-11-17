import { describe, expect, it } from 'vitest';

import { AGENT_IDS as SHARED_AGENT_IDS } from '@happier-dev/agents';

import type { AgentId } from './registryCore';
import {
    AGENTS_UI,
    getAgentAvatarOverlaySizes,
    getAgentCliGlyph,
    getAgentIconSource,
    getAgentIconSvgXml,
    getAgentIconTintColor,
    getAgentPickerIconScale,
} from './registryUi';
import { DEFAULT_AGENT_ID } from './registryCore';

function sortedKeys(value: Record<string, unknown>): string[] {
    return Object.keys(value).sort();
}

describe('agents/registryUi', () => {
    it('covers the full canonical provider universe (no UI-only drift)', () => {
        expect(sortedKeys(AGENTS_UI)).toEqual([...SHARED_AGENT_IDS].sort());
    });

    it('falls back to the default UI config for unknown agent ids across registry accessors', () => {
        const unknownAgentId = 'retired-agent' as AgentId;
        const theme = { colors: { text: { primary: '#000000' } } } as Parameters<typeof getAgentIconSvgXml>[1];

        expect(getAgentIconSource(unknownAgentId)).toBe(getAgentIconSource(DEFAULT_AGENT_ID));
        expect(getAgentIconSvgXml(unknownAgentId, theme)).toBe(getAgentIconSvgXml(DEFAULT_AGENT_ID, theme));
        expect(getAgentIconTintColor(unknownAgentId, theme)).toBe(getAgentIconTintColor(DEFAULT_AGENT_ID, theme));
        expect(getAgentPickerIconScale(unknownAgentId)).toBe(getAgentPickerIconScale(DEFAULT_AGENT_ID));
        expect(getAgentAvatarOverlaySizes(unknownAgentId, 48)).toEqual(getAgentAvatarOverlaySizes(DEFAULT_AGENT_ID, 48));
        expect(getAgentCliGlyph(unknownAgentId)).toBe(getAgentCliGlyph(DEFAULT_AGENT_ID));
    });

    it('slightly enlarges the Claude picker icon to compensate for the logo silhouette', () => {
        expect(getAgentPickerIconScale('claude')).toBe(1.1);
    });
});