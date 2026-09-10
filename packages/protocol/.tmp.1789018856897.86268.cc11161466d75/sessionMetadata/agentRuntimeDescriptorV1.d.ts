import { z } from 'zod';
import { type CodexBackendMode } from '../providers/codex/backendMode.js';
type AgentRuntimeDescriptorProviderShape = Readonly<Record<string, unknown>>;
export type AgentRuntimeDescriptorProviderExtraV1 = Readonly<{
    owner: string;
    schemaId: string;
    v: number;
} & Record<string, unknown>>;
export type AgentRuntimeDescriptorEnvelopeV1<TProviderId extends string = string, TProvider extends AgentRuntimeDescriptorProviderShape = AgentRuntimeDescriptorProviderShape> = Readonly<{
    v: 1;
    providerId: TProviderId;
    provider: TProvider;
} & Record<string, unknown>>;
type CodexAgentRuntimeDescriptorProvider = Readonly<{
    backendMode: CodexBackendMode;
    vendorSessionId?: string;
    homePath?: string;
    sqliteHomePath?: string;
    home?: 'user' | 'connectedService';
    connectedServiceId?: string;
    connectedServiceProfileId?: string;
    connectedServiceGroupId?: string;
    providerExtra?: Readonly<AgentRuntimeDescriptorProviderExtraV1 & {
        runtimeAffinity?: Readonly<{
            backendMode?: CodexBackendMode;
            vendorSessionId?: string;
            homePath?: string;
            sqliteHomePath?: string;
            home?: 'user' | 'connectedService';
            connectedServiceId?: string;
            connectedServiceProfileId?: string;
            connectedServiceGroupId?: string;
        }>;
    }>;
}>;
type OpenCodeAgentRuntimeDescriptorProvider = Readonly<{
    backendMode: 'server' | 'acp';
    vendorSessionId?: string;
    serverBaseUrl?: string;
    serverBaseUrlExplicit?: true;
    providerExtra?: Readonly<AgentRuntimeDescriptorProviderExtraV1 & {
        runtimeHandle?: Readonly<{
            backendMode?: 'server' | 'acp';
            vendorSessionId?: string;
            serverBaseUrl?: string;
            serverBaseUrlExplicit?: true;
        }>;
    }>;
}>;
type PiAgentRuntimeDescriptorProvider = Readonly<{
    resumeStrategy: 'sessionFileBySessionId' | 'sessionFileAbsolutePreferred';
    vendorSessionId?: string;
    sessionFile?: string;
}>;
export type CodexAgentRuntimeDescriptorV1 = AgentRuntimeDescriptorEnvelopeV1<'codex', CodexAgentRuntimeDescriptorProvider>;
export type OpenCodeAgentRuntimeDescriptorV1 = AgentRuntimeDescriptorEnvelopeV1<'opencode', OpenCodeAgentRuntimeDescriptorProvider>;
export type PiAgentRuntimeDescriptorV1 = AgentRuntimeDescriptorEnvelopeV1<'pi', PiAgentRuntimeDescriptorProvider>;
export type AgentRuntimeDescriptorV1 = AgentRuntimeDescriptorEnvelopeV1;
type CanonicalAgentRuntimeDescriptorByProviderId = {
    codex: Readonly<{
        providerId: 'codex';
        backendMode: CodexBackendMode | null;
        vendorSessionId: string | null;
        home: 'user' | 'connectedService' | null;
        connectedServiceId: string | null;
        connectedServiceProfileId: string | null;
        connectedServiceGroupId: string | null;
        homePath: string | null;
        sqliteHomePath: string | null;
    }>;
    opencode: Readonly<{
        providerId: 'opencode';
        backendMode: 'server' | 'acp' | null;
        vendorSessionId: string | null;
        serverBaseUrl: string | null;
        serverBaseUrlExplicit: boolean;
    }>;
    pi: Readonly<{
        providerId: 'pi';
        resumeStrategy: 'sessionFileBySessionId' | 'sessionFileAbsolutePreferred' | null;
        vendorSessionId: string | null;
        sessionFile: string | null;
    }>;
};
export declare function createAgentRuntimeDescriptorV1Schema(zod: typeof z): any;
export declare const AgentRuntimeDescriptorV1Schema: any;
export declare function buildCodexAgentRuntimeDescriptorV1(params: Readonly<{
    backendMode: 'mcp' | 'acp' | 'appServer';
    vendorSessionId?: string | null;
    home?: 'user' | 'connectedService' | null;
    connectedServiceId?: string | null;
    connectedServiceProfileId?: string | null;
    connectedServiceGroupId?: string | null;
    homePath?: string | null;
    sqliteHomePath?: string | null;
}>): CodexAgentRuntimeDescriptorV1;
export declare function buildOpenCodeAgentRuntimeDescriptorV1(params: Readonly<{
    backendMode: 'server' | 'acp';
    vendorSessionId?: string | null;
    serverBaseUrl?: string | null;
    serverBaseUrlExplicit?: boolean;
}>): OpenCodeAgentRuntimeDescriptorV1;
export declare function buildPiAgentRuntimeDescriptorV1(params: Readonly<{
    resumeStrategy: 'sessionFileBySessionId' | 'sessionFileAbsolutePreferred';
    vendorSessionId?: string | null;
    sessionFile?: string | null;
}>): PiAgentRuntimeDescriptorV1;
export declare function readAgentRuntimeDescriptorV1(value: unknown): AgentRuntimeDescriptorV1 | null;
export declare function readAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'codex'): CodexAgentRuntimeDescriptorV1 | null;
export declare function readAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'opencode'): OpenCodeAgentRuntimeDescriptorV1 | null;
export declare function readAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'pi'): PiAgentRuntimeDescriptorV1 | null;
export declare function readAgentRuntimeDescriptorV1ForProvider<TProviderId extends string>(value: unknown, providerId: TProviderId): AgentRuntimeDescriptorEnvelopeV1<TProviderId> | null;
export declare function readCanonicalAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'codex'): CanonicalAgentRuntimeDescriptorByProviderId['codex'] | null;
export declare function readCanonicalAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'opencode'): CanonicalAgentRuntimeDescriptorByProviderId['opencode'] | null;
export declare function readCanonicalAgentRuntimeDescriptorV1ForProvider(value: unknown, providerId: 'pi'): CanonicalAgentRuntimeDescriptorByProviderId['pi'] | null;
export {};
//# sourceMappingURL=agentRuntimeDescriptorV1.d.ts.map