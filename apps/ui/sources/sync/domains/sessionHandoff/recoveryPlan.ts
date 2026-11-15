import {
    readSessionMetadataRuntimeDescriptor,
    resolveVendorHandoffIdFromSessionMetadata,
    type AgentId,
} from '@happier-dev/agents';
import { normalizeCodexBackendMode } from '@happier-dev/protocol';
import { resolveAgentIdFromFlavor } from '@/agents/registry/registryCore';
import type { Metadata } from '@/sync/domains/state/storageTypes';

export type SessionHandoffRecoveryAction =
    | 'restart_on_source'
    | 'keep_stopped'
    | 'retry_source_cleanup';

export type SessionHandoffSourceResumePlan = Readonly<{
    sessionId: string;
    machineId: string;
    directory: string;
    agent: AgentId;
    resume?: string;
    transcriptStorage: 'direct' | 'persisted';
    serverId: string | null;
    agentRuntimeDescriptorV1?: unknown;
    codexBackendMode?: 'mcp' | 'acp' | 'appServer';
    environmentVariables?: Record<string, string>;
}>;

function resolveRecoveryAgentId(metadata: Metadata): AgentId | null {
    const byFlavor = resolveAgentIdFromFlavor(metadata.flavor);
    if (byFlavor) return byFlavor;

    if (readSessionMetadataRuntimeDescriptor(metadata, 'codex')) return 'codex';
    return null;
}

export type SessionHandoffRecoveryPlan = Readonly<{
    handoffId: string;
    actions: readonly SessionHandoffRecoveryAction[];
    sourceResume?: SessionHandoffSourceResumePlan;
    targetCleanup?: Readonly<{
        machineId: string;
        sessionId: string;
        serverId: string | null;
    }>;
    sourceCleanup?: Readonly<{
        machineId: string;
        serverId: string | null;
        workspaceReplicationReverseSourceRootPath: string | null;
        workspaceReplicationReverseTargetRootPath: string | null;
    }>;
    targetFinalization?: Readonly<{
        sessionId: string;
        sourceMachineId: string;
        targetMachineId: string;
        serverId: string | null;
        sourceMetadataForHandoff: Metadata;
        providerId: AgentId;
        sessionStorageBefore: 'direct' | 'persisted';
        sessionStorageAfter: 'direct' | 'persisted';
        targetPath: string;
        transportStrategy: 'direct_peer' | 'server_routed_stream';
        completedAtMs: number;
        targetRemoteSessionId: string;
        targetDirectSource: Record<string, unknown>;
        targetRuntimeDescriptor?: unknown;
    }>;
}>;

function resolveVendorResumeId(metadata: Metadata): string | undefined {
    const agentId = resolveRecoveryAgentId(metadata);
    if (!agentId) return undefined;

    return resolveVendorHandoffIdFromSessionMetadata(agentId, metadata) ?? undefined;
}

export function buildSessionHandoffRecoveryPlan(input: Readonly<{
    handoffId: string;
    sessionId: string;
    sourceMachineId: string;
    targetMachineId?: string;
    sourceMetadata: Metadata;
    sessionStorageMode: 'direct' | 'persisted';
    serverId?: string | null;
}>): SessionHandoffRecoveryPlan | null {
    const agent = resolveRecoveryAgentId(input.sourceMetadata);
    const directory = typeof input.sourceMetadata.path === 'string' ? input.sourceMetadata.path.trim() : '';
    if (!agent || !directory) return null;

    const codexBackendMode = normalizeCodexBackendMode(input.sourceMetadata.codexBackendMode);

    return {
        handoffId: input.handoffId,
        actions: ['restart_on_source', 'keep_stopped'],
        ...(input.targetMachineId ? {
            targetCleanup: {
                machineId: input.targetMachineId,
                sessionId: input.sessionId,
                serverId: typeof input.serverId === 'string' ? input.serverId.trim() || null : null,
            },
        } : {}),
        sourceResume: {
            sessionId: input.sessionId,
            machineId: input.sourceMachineId,
            directory,
            agent,
            ...(resolveVendorResumeId(input.sourceMetadata) ? { resume: resolveVendorResumeId(input.sourceMetadata) } : {}),
            transcriptStorage: input.sessionStorageMode,
            serverId: typeof input.serverId === 'string' ? input.serverId.trim() || null : null,
            ...(input.sourceMetadata.agentRuntimeDescriptorV1 ? { agentRuntimeDescriptorV1: input.sourceMetadata.agentRuntimeDescriptorV1 } : {}),
            ...(codexBackendMode ? { codexBackendMode } : {}),
        },
    };
}
