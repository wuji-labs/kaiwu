import { describe, expect, it, vi } from 'vitest';

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({
        translate: (key: string) => `t:${key}`,
    });
});

import { getResolvedBackendCatalogEntries, resolveBuiltInAgentTitle } from './getResolvedBackendCatalogEntries';

describe('getResolvedBackendCatalogEntries', () => {
    it('returns built-in agents followed by configured ACP backends without surfacing the custom ACP container backend', () => {
        const entries = getResolvedBackendCatalogEntries({
            enabledAgentIds: ['claude', 'customAcp'],
            acpCatalogSettingsV1: {
                v: 2,
                backends: [
                    {
                        id: 'review-bot',
                        name: 'review-bot',
                        title: 'Review Bot',
                        description: 'Custom review backend',
                        command: 'kiro-cli',
                        args: ['acp', '--agent', 'review'],
                        env: {},
                        transportProfile: 'generic',
                        defaultMode: 'plan',
                        defaultModel: 'sonnet',
                        capabilities: {
                            supportsLoadSession: false,
                            supportsModes: 'unknown',
                            supportsModels: 'unknown',
                            supportsConfigOptions: 'unknown',
                            promptImageSupport: 'unknown',
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
            },
        });

        expect(entries).toEqual([
            expect.objectContaining({
                target: { kind: 'builtInAgent', agentId: 'claude' },
                targetKey: 'agent:claude',
                family: 'builtInAgent',
                providerAgentId: 'claude',
                iconAgentId: 'claude',
                title: 't:agentInput.agent.claude',
            }),
            expect.objectContaining({
                target: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
                targetKey: 'acpBackend:review-bot',
                family: 'configuredAcpBackend',
                providerAgentId: 'customAcp',
                iconAgentId: 'customAcp',
                title: 'Review Bot',
                subtitle: 'review-bot',
            }),
        ]);
    });

    it('omits configured ACP backends disabled by target key', () => {
        const entries = getResolvedBackendCatalogEntries({
            enabledAgentIds: ['claude', 'customAcp'],
            backendEnabledByTargetKey: {
                'acpBackend:review-bot': false,
            },
            acpCatalogSettingsV1: {
                v: 2,
                backends: [
                    {
                        id: 'review-bot',
                        name: 'review-bot',
                        title: 'Review Bot',
                        description: 'Custom review backend',
                        command: 'kiro-cli',
                        args: ['acp', '--agent', 'review'],
                        env: {},
                        transportProfile: 'generic',
                        defaultMode: 'plan',
                        defaultModel: 'sonnet',
                        capabilities: {
                            supportsLoadSession: false,
                            supportsModes: 'unknown',
                            supportsModels: 'unknown',
                            supportsConfigOptions: 'unknown',
                            promptImageSupport: 'unknown',
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
            },
        });

        expect(entries.map((entry) => entry.targetKey)).toEqual(['agent:claude']);
    });

    it('keeps configured ACP backends visible when sentinel collapsing is enabled', () => {
        const entries = getResolvedBackendCatalogEntries({
            enabledAgentIds: ['claude', 'customAcp'],
            collapseConfiguredBackendProviderSentinels: true,
            acpCatalogSettingsV1: {
                v: 2,
                backends: [
                    {
                        id: 'review-bot',
                        name: 'review-bot',
                        title: 'Review Bot',
                        description: 'Custom review backend',
                        command: 'kiro-cli',
                        args: ['acp', '--agent', 'review'],
                        env: {},
                        transportProfile: 'generic',
                        defaultMode: 'plan',
                        defaultModel: 'sonnet',
                        capabilities: {
                            supportsLoadSession: false,
                            supportsModes: 'unknown',
                            supportsModels: 'unknown',
                            supportsConfigOptions: 'unknown',
                            promptImageSupport: 'unknown',
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
            },
        });

        expect(entries.map((entry) => entry.targetKey)).toEqual(['agent:claude', 'acpBackend:review-bot']);
        expect(entries[1]).toEqual(expect.objectContaining({
            family: 'configuredAcpBackend',
            providerAgentId: 'customAcp',
        }));
    });
});

describe('resolveBuiltInAgentTitle', () => {
    it('returns the localized title for known built-in agents', () => {
        expect(resolveBuiltInAgentTitle('claude')).toBe('t:agentInput.agent.claude');
        expect(resolveBuiltInAgentTitle('codex')).toBe('t:agentInput.agent.codex');
        expect(resolveBuiltInAgentTitle('customAcp')).toBe('t:agentInput.agent.customAcp');
    });

    it('returns null for ids outside the catalog', () => {
        expect(resolveBuiltInAgentTitle('unknown-agent')).toBeNull();
        expect(resolveBuiltInAgentTitle('native-review-engine')).toBeNull();
    });
});
