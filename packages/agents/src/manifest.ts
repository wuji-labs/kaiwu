import type { AgentCore, AgentId } from './types.js';
import { getProviderCliRuntimeSpec } from './providers/providerCliRuntime.js';

export const DEFAULT_AGENT_ID: AgentId = 'claude';

/**
 * First-class Agents that Kaiwu surfaces and probes by default (集团核心三强).
 * The generic Custom ACP entry remains available for user-defined ACP backends.
 */
export const DEFAULT_ACTIVE_AGENT_IDS = ['claude', 'codex', 'gemini'] as const;
export type DefaultActiveAgentId = (typeof DEFAULT_ACTIVE_AGENT_IDS)[number];

export function isDefaultActiveAgentId(agentId: AgentId): agentId is DefaultActiveAgentId {
    return (DEFAULT_ACTIVE_AGENT_IDS as readonly AgentId[]).includes(agentId);
}

const NO_NATIVE_IMAGE_GENERATION = 'unsupported' as const;
const GENERIC_SESSION_MEDIA_OUTPUT = 'supported' as const;
const EXPERIMENTAL_SESSION_MEDIA_OUTPUT = 'experimental' as const;

function providerDetectKey(agentId: AgentId): string {
    return getProviderCliRuntimeSpec(agentId).binaryName;
}

export const AGENTS_CORE = {
    claude: {
        id: 'claude',
        cliSubcommand: 'claude',
        detectKey: providerDetectKey('claude'),
        flavorAliases: [],
        cloudConnect: { vendorKey: 'anthropic', status: 'wired' },
        connectedServices: {
            supportedServiceIds: ['claude-subscription', 'anthropic'],
            sessionAuthSwitch: {
                continuityMode: 'restart_same_home',
                supportedTransitions: ['same_connected_group'],
                providerStateSharingRequired: {
                    serviceIds: ['claude-subscription', 'anthropic'],
                    supportedTransitions: ['native_to_connected', 'connected_to_native', 'connected_to_connected'],
                },
            },
            providerStateSharing: {
                config: {
                    supported: true,
                    modes: ['linked', 'copied', 'isolated'],
                },
                state: {
                    supported: true,
                    modes: ['isolated', 'shared'],
                    sharedStatePrivacyRiskAcknowledgementRequired: true,
                },
            },
            supportedKindsByServiceId: {
                'claude-subscription': ['oauth', 'token'],
                anthropic: ['token'],
            },
        },
        resume: {
            vendorResume: 'supported',
            vendorResumeIdField: 'claudeSessionId',
            // The Agent's own session-log POINTER for the handoff brief, not a
            // resume gate (`AM-24`). The predecessor key name is retained
            // deliberately — see `AgentResumeConfig`.
            vendorResumeContinuityProofField: 'claudeTranscriptPath',
        },
        sessionStorage: { direct: true, persisted: true },
        sessionCapabilities: {
            sessionListing: 'supported',
            sessionFork: { conversation: 'unsupported', fromMessage: 'unsupported' },
            sessionRollback: { conversation: 'unsupported' },
            usageLimitRecovery: { checkNow: 'supported' },
        },
        handoff: { vendorStateTransfer: 'supported' },
        localControl: { supported: true, topology: 'exclusive', attachStrategy: 'tmux' },
        runtimeInput: {
            inFlightSteerSupported: true,
            terminalPromptInjectionSupported: true,
        },
        tools: { delivery: 'native_mcp', support: 'supported' },
        media: {
            acceptsImageInput: 'supported',
            emitsSessionMedia: GENERIC_SESSION_MEDIA_OUTPUT,
            nativeImageGeneration: NO_NATIVE_IMAGE_GENERATION,
        },
    },
    codex: {
        id: 'codex',
        cliSubcommand: 'codex',
        detectKey: providerDetectKey('codex'),
        flavorAliases: ['codex-acp', 'codex-mcp', 'openai', 'gpt'],
        cloudConnect: { vendorKey: 'openai', status: 'wired' },
        connectedServices: {
            supportedServiceIds: ['openai-codex', 'openai'],
            sessionAuthSwitch: {
                continuityMode: 'restart_shared_state_required',
                supportedTransitions: ['same_connected_group'],
                providerStateSharingRequired: {
                    serviceIds: ['openai-codex'],
                    supportedTransitions: ['native_to_connected', 'connected_to_native', 'connected_to_connected'],
                },
            },
            providerStateSharing: {
                config: {
                    supported: true,
                    modes: ['linked', 'copied', 'isolated'],
                },
                state: {
                    supported: true,
                    modes: ['isolated', 'shared'],
                    sharedStatePrivacyRiskAcknowledgementRequired: true,
                },
            },
            supportedKindsByServiceId: {
                'openai-codex': ['oauth'],
                openai: ['token'],
            },
        },
        resume: { vendorResume: 'experimental', vendorResumeIdField: 'codexSessionId' },
        sessionStorage: { direct: true, persisted: true },
        sessionCapabilities: {
            sessionListing: 'supported',
            sessionFork: { conversation: 'supported', fromMessage: 'unsupported' },
            sessionRollback: { conversation: 'supported' },
            usageLimitRecovery: { checkNow: 'supported' },
        },
        runtimeKinds: {
            defaultKind: 'appServer',
            byKind: {
                mcp: {
                    kind: 'mcp',
                    overrides: {
                        resume: { vendorResume: 'unsupported' },
                        sessionCapabilities: {
                            sessionFork: { conversation: 'unsupported' },
                            sessionRollback: { conversation: 'unsupported' },
                            usageLimitRecovery: { checkNow: 'unsupported' },
                        },
                        handoff: { vendorStateTransfer: 'unsupported' },
                        localControl: null,
                        media: { nativeImageGeneration: NO_NATIVE_IMAGE_GENERATION },
                    },
                },
                acp: {
                    kind: 'acp',
                    overrides: {
                        sessionCapabilities: {
                            sessionFork: { conversation: 'unsupported' },
                            sessionRollback: { conversation: 'unsupported' },
                            usageLimitRecovery: { checkNow: 'unsupported' },
                        },
                        media: { nativeImageGeneration: NO_NATIVE_IMAGE_GENERATION },
                    },
                },
                appServer: { kind: 'appServer' },
            },
        },
        handoff: { vendorStateTransfer: 'experimental', requiresExplicitSessionId: true },
        localControl: { supported: true, topology: 'exclusive', attachStrategy: 'tmux' },
        tools: { delivery: 'native_mcp', support: 'supported' },
        media: {
            acceptsImageInput: 'supported',
            emitsSessionMedia: GENERIC_SESSION_MEDIA_OUTPUT,
            nativeImageGeneration: 'supported',
        },
    },
    gemini: {
        id: 'gemini',
        cliSubcommand: 'gemini',
        detectKey: providerDetectKey('gemini'),
        flavorAliases: [],
        cloudConnect: { vendorKey: 'gemini', status: 'wired' },
        connectedServices: {
            supportedServiceIds: ['gemini'],
            sessionAuthSwitch: {
                continuityMode: 'restart_same_home',
                supportedTransitions: ['native_to_connected', 'connected_to_connected'],
            },
            supportedKindsByServiceId: {
                gemini: ['oauth'],
            },
        },
        resume: { vendorResume: 'supported', vendorResumeIdField: 'geminiSessionId' },
        sessionStorage: { direct: false, persisted: true },
        sessionCapabilities: {
            sessionListing: 'unsupported',
            sessionFork: { conversation: 'unsupported', fromMessage: 'unsupported' },
            sessionRollback: { conversation: 'unsupported' },
            usageLimitRecovery: { checkNow: 'supported' },
        },
        handoff: { vendorStateTransfer: 'unsupported' },
        tools: { delivery: 'native_mcp', support: 'supported' },
        media: {
            acceptsImageInput: 'supported',
            emitsSessionMedia: 'unsupported',
            nativeImageGeneration: NO_NATIVE_IMAGE_GENERATION,
        },
    },
    customAcp: {
        id: 'customAcp',
        cliSubcommand: 'customAcp',
        detectKey: providerDetectKey('customAcp'),
        flavorAliases: ['custom-acp'],
        cloudConnect: null,
        connectedServices: null,
        resume: { vendorResume: 'unsupported' },
        sessionStorage: { direct: true, persisted: true },
        sessionCapabilities: {
            sessionListing: 'unsupported',
            sessionFork: { conversation: 'unsupported', fromMessage: 'unsupported' },
            sessionRollback: { conversation: 'unsupported' },
        },
        handoff: { vendorStateTransfer: 'unsupported' },
        tools: { delivery: 'native_mcp', support: 'supported' },
        media: {
            acceptsImageInput: 'experimental',
            emitsSessionMedia: GENERIC_SESSION_MEDIA_OUTPUT,
            nativeImageGeneration: NO_NATIVE_IMAGE_GENERATION,
        },
    },
} as const satisfies Record<AgentId, AgentCore>;
