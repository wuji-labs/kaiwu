import { describe, expect, it } from 'vitest';

import {
    getSelectableBackendEntriesForNewSession,
    getSelectableAgentIdsForNewSession,
    isBackendEntrySelectableForNewSession,
    isAgentSelectableForNewSession,
    resolveNextSelectableBackendEntryForNewSession,
    resolveNextSelectableAgentForNewSession,
    resolveProfileAvailabilityForNewSession,
} from './newSessionAgentSelection';

describe('newSessionAgentSelection', () => {
    it('treats all agents as selectable before detection completes', () => {
        expect(isAgentSelectableForNewSession({
            agentId: 'codex',
            detectionTimestamp: 0,
            availabilityById: { codex: false },
            installableDepKeyCountByAgentId: { codex: 0 },
        })).toBe(true);
    });

    it('keeps unavailable agents selectable when they have installable dependencies', () => {
        expect(isAgentSelectableForNewSession({
            agentId: 'codex',
            detectionTimestamp: 1,
            availabilityById: { codex: false },
            installableDepKeyCountByAgentId: { codex: 1 },
        })).toBe(true);
    });

    it('keeps unavailable agents selectable when the UI marks them as selectable without CLI detection', () => {
        expect(isAgentSelectableForNewSession({
            agentId: 'customAcp',
            detectionTimestamp: 1,
            availabilityById: { customAcp: false },
            installableDepKeyCountByAgentId: { customAcp: 0 },
            selectableWithoutCliByAgentId: { customAcp: true },
        })).toBe(true);
    });

    it('treats logged-out agents as unavailable even when the CLI is installed', () => {
        expect(isAgentSelectableForNewSession({
            agentId: 'codex',
            detectionTimestamp: 1,
            availabilityById: { codex: true },
            authStatusById: {
                codex: {
                    state: 'logged_out',
                    checkedAt: 123,
                },
            },
            installableDepKeyCountByAgentId: { codex: 0 },
        })).toBe(false);
    });

    it('treats missing availability as unavailable after detection completes unless another path keeps it selectable', () => {
        expect(isAgentSelectableForNewSession({
            agentId: 'codex',
            detectionTimestamp: 1,
            availabilityById: {},
            installableDepKeyCountByAgentId: { codex: 0 },
        })).toBe(false);
    });

    it('resolves the next selectable agent while skipping unavailable intermediates', () => {
        expect(resolveNextSelectableAgentForNewSession({
            candidateAgentIds: ['claude', 'codex', 'gemini'],
            currentAgentId: 'claude',
            detectionTimestamp: 1,
            availabilityById: { claude: true, codex: false, gemini: true },
            installableDepKeyCountByAgentId: { codex: 0 },
        })).toBe('gemini');
    });

    it('builds the selectable list from candidates using the same policy as chip cycling', () => {
        expect(getSelectableAgentIdsForNewSession({
            candidateAgentIds: ['claude', 'codex', 'gemini'],
            detectionTimestamp: 1,
            availabilityById: { claude: true, codex: false, gemini: true },
            installableDepKeyCountByAgentId: { codex: 0 },
        })).toEqual(['claude', 'gemini']);
    });

    it('marks multi-cli profiles as available when at least one supported agent remains selectable', () => {
        expect(resolveProfileAvailabilityForNewSession({
            candidateBackendEntries: [
                { target: { kind: 'builtInAgent', agentId: 'claude' }, targetKey: 'agent:claude', builtInAgentId: 'claude', family: 'builtInAgent' },
                { target: { kind: 'builtInAgent', agentId: 'codex' }, targetKey: 'agent:codex', builtInAgentId: 'codex', family: 'builtInAgent' },
            ],
            detectionTimestamp: 1,
            availabilityById: { claude: false, codex: false },
            installableDepKeyCountByAgentId: { codex: 1 },
        })).toEqual({ available: true });
    });

    it('marks multi-cli profiles unavailable with a logged-out reason when every installed agent is logged out', () => {
        expect(resolveProfileAvailabilityForNewSession({
            candidateBackendEntries: [
                { target: { kind: 'builtInAgent', agentId: 'claude' }, targetKey: 'agent:claude', builtInAgentId: 'claude', family: 'builtInAgent' },
                { target: { kind: 'builtInAgent', agentId: 'codex' }, targetKey: 'agent:codex', builtInAgentId: 'codex', family: 'builtInAgent' },
            ],
            detectionTimestamp: 1,
            availabilityById: { claude: true, codex: true },
            authStatusById: {
                claude: { state: 'logged_out', checkedAt: 1 },
                codex: { state: 'logged_out', checkedAt: 1 },
            },
            installableDepKeyCountByAgentId: {},
        })).toEqual({ available: false, reason: 'logged-out:any' });
    });

    it('treats configured ACP backend entries as selectable without built-in CLI detection', () => {
        const entry = {
            target: { kind: 'configuredAcpBackend', backendId: 'review-bot' } as const,
            targetKey: 'acpBackend:review-bot',
            builtInAgentId: null,
            family: 'configuredAcpBackend' as const,
        };
        expect(isBackendEntrySelectableForNewSession({
            entry,
            detectionTimestamp: 1,
            availabilityById: { customAcp: false },
            installableDepKeyCountByAgentId: { customAcp: 0 },
        })).toBe(true);
        expect(getSelectableBackendEntriesForNewSession({
            candidateBackendEntries: [entry],
            detectionTimestamp: 1,
            availabilityById: { customAcp: false },
            installableDepKeyCountByAgentId: { customAcp: 0 },
        })).toEqual([entry]);
    });

    it('resolves profile availability from configured ACP backend targets', () => {
        expect(resolveProfileAvailabilityForNewSession({
            candidateBackendEntries: [
                {
                    target: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
                    targetKey: 'acpBackend:review-bot',
                    builtInAgentId: null,
                    family: 'configuredAcpBackend',
                },
            ],
            detectionTimestamp: 1,
            availabilityById: { customAcp: false },
            installableDepKeyCountByAgentId: { customAcp: 0 },
        })).toEqual({ available: true });
    });

    it('cycles to a compatible configured ACP backend when no compatible built-in backend remains selectable', () => {
        const next = resolveNextSelectableBackendEntryForNewSession({
            candidateBackendEntries: [
                {
                    target: { kind: 'builtInAgent', agentId: 'claude' },
                    targetKey: 'agent:claude',
                    builtInAgentId: 'claude',
                    family: 'builtInAgent',
                },
                {
                    target: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
                    targetKey: 'acpBackend:review-bot',
                    builtInAgentId: null,
                    family: 'configuredAcpBackend',
                },
            ],
            currentTargetKey: 'agent:claude',
            detectionTimestamp: 1,
            availabilityById: { claude: false, customAcp: false },
            installableDepKeyCountByAgentId: { claude: 0, customAcp: 0 },
        });

        expect(next?.target).toEqual({ kind: 'configuredAcpBackend', backendId: 'review-bot' });
    });
});
