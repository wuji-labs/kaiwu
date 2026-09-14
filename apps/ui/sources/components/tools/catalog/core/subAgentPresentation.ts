import { readSessionAppliedModelMetadataStateV1 } from '@happier-dev/agents';

import { resolveBuiltInAgentTitle } from '@/agents/backendCatalog/getResolvedBackendCatalogEntries';
import { isAgentId, resolveAgentIdFromFlavor, type AgentId } from '@/agents/catalog/catalog';
import { findModelOptionForEffectiveModelId, getModelOptionsForSession } from '@/sync/domains/models/modelOptions';
import type { ToolCall } from '@/sync/domains/messages/messageTypes';
import { readSessionModelsState } from '@/sync/domains/sessionControl/readSessionControlMetadata';
import type { Metadata } from '@/sync/domains/state/storageTypes';
import { t } from '@/text';

type SubagentToolPresentation = Readonly<{
    title: string;
    iconAgentId: AgentId | null;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function readNonBlankString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readFirstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = readNonBlankString(record[key]);
        if (value) return value;
    }
    return null;
}

function humanizeAgentType(value: string): string {
    const withoutAgentSuffix = value.replace(/(?:[\s_-]+agent)$/i, '');
    return withoutAgentSuffix
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(' ');
}

function resolveManagedAgentId(input: Record<string, unknown>): AgentId | null {
    const target = asRecord(input.backendTarget);
    if (target?.kind === 'builtInAgent' && isAgentId(target.agentId)) return target.agentId;
    if (target?.kind === 'configuredAcpBackend') return 'customAcp';

    const legacyBackendId = readNonBlankString(input.backendId);
    return isAgentId(legacyBackendId) ? legacyBackendId : null;
}

function resolveConfiguredBackendId(input: Record<string, unknown>): string | null {
    const target = asRecord(input.backendTarget);
    if (target?.kind === 'configuredAcpBackend') return readNonBlankString(target.backendId);
    return null;
}

function resolveModelLabel(params: {
    modelId: string | null;
    agentId: AgentId | null;
    metadata: Metadata | null;
}): string | null {
    if (!params.modelId || params.modelId === 'default') return null;
    if (!params.agentId) return params.modelId;

    const option = findModelOptionForEffectiveModelId(
        getModelOptionsForSession(params.agentId, params.metadata),
        params.modelId,
    );
    return option?.label.trim() || params.modelId;
}

function resolveNativeSessionModelId(agentId: AgentId | null, metadata: Metadata | null): string | null {
    if (!agentId) return null;
    const metadataRecord = metadata as unknown as Record<string, unknown> | null;
    const applied = readSessionAppliedModelMetadataStateV1(metadataRecord);
    if (applied?.provider === agentId) return readNonBlankString(applied.modelId);

    const models = readSessionModelsState(metadata);
    return models?.provider === agentId ? readNonBlankString(models.currentModelId) : null;
}

function resolveManagedIntent(input: Record<string, unknown>): string | null {
    const intent = readNonBlankString(input.intent);
    if (!intent) return null;
    if (intent === 'review' || intent === 'plan' || intent === 'delegate') {
        return t(`session.subagents.intent.${intent}`);
    }
    return humanizeAgentType(intent);
}

function resolveNativeAgentType(input: Record<string, unknown>): string | null {
    const raw = readFirstString(input, ['subagent_type', 'agent_type', 'role', 'nickname']);
    return raw ? humanizeAgentType(raw) : null;
}

export function resolveSubagentToolPresentation(params: {
    tool: ToolCall;
    metadata: Metadata | null;
}): SubagentToolPresentation {
    const input = asRecord(params.tool.input) ?? {};
    const isManagedRun = params.tool.name === 'SubAgentRun';
    const agentId = isManagedRun
        ? resolveManagedAgentId(input)
        : resolveAgentIdFromFlavor(params.metadata?.flavor);

    const explicitModelId = isManagedRun
        ? readNonBlankString(asRecord(input.requestedConfiguration)?.modelId)
        : readFirstString(input, ['model', 'modelId', 'model_id']);
    const modelId = explicitModelId ?? (isManagedRun ? null : resolveNativeSessionModelId(agentId, params.metadata));
    const modelLabel = resolveModelLabel({ modelId, agentId, metadata: params.metadata });

    const targetLabel = isManagedRun
        ? (resolveConfiguredBackendId(input) ?? (agentId ? resolveBuiltInAgentTitle(agentId) : null))
        : (agentId ? resolveBuiltInAgentTitle(agentId) : null);
    const identity = modelLabel ?? targetLabel;
    const agentType = isManagedRun ? resolveManagedIntent(input) : resolveNativeAgentType(input);
    const label = [identity, agentType].filter((part): part is string => Boolean(part)).join(' ');

    return {
        title: label ? t('tools.subAgentTitle', { label }) : t('tools.names.subAgent'),
        iconAgentId: agentId,
    };
}
