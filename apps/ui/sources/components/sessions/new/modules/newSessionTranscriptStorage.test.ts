import { describe, expect, it } from 'vitest';

import {
    coerceNewSessionTranscriptStorage,
    supportsDirectTranscriptStorageForNewSession,
} from './newSessionTranscriptStorage';

describe('supportsDirectTranscriptStorageForNewSession', () => {
    it('uses shared agent session-storage support when no UI override is required', () => {
        expect(supportsDirectTranscriptStorageForNewSession({
            agentId: 'codex',
            settings: {},
        })).toBe(true);
    });

    it('returns false when the agent does not support direct transcript storage', () => {
        expect(supportsDirectTranscriptStorageForNewSession({
            agentId: 'gemini',
            settings: {},
        })).toBe(false);
    });
});

describe('coerceNewSessionTranscriptStorage', () => {
    it('falls back to synced when direct storage is unsupported by the agent/runtime', () => {
        expect(coerceNewSessionTranscriptStorage({
            requested: 'direct',
            agentId: 'gemini',
            settings: {},
            directSessionsEnabled: true,
        })).toBe('persisted');
    });
});