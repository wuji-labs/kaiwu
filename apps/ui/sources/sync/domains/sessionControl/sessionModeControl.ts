import type { AgentId } from '@/agents/catalog/catalog';
import { getAgentCore } from '@/agents/catalog/catalog';
import type { Metadata } from '@/sync/domains/state/storageTypes';
import { parsePermissionIntentAlias } from '@happier-dev/agents';
import { resolveRequestedSessionModeId } from '@happier-dev/protocol';
import { tLoose } from '@/text';
import {
    normalizeSessionModeOptions,
    resolveSessionModeDisplayName,
    type SessionModeOption,
} from '@/sync/domains/sessionModes/sessionModeOptions';

import { readSessionModeOverrideState, readSessionModesState } from './readSessionControlMetadata';

export { type SessionModeOption };

export function supportsSessionModeOverrides(agentId: AgentId): boolean {
    const kind = getAgentCore(agentId).sessionModes.kind;
    return kind !== 'none';
}

export type SessionModePickerControl = Readonly<{
    options: readonly SessionModeOption[];
    currentModeId: string;
    currentModeName: string;
    requestedModeId: string | null;
    requestedModeName: string | null;
    effectiveModeId: string;
    effectiveModeName: string;
    isPending: boolean;
}>;

export function resolveRequestedSessionModeIdForMetadata(
    control: SessionModePickerControl | null | undefined,
    requestedModeId: string,
): string {
    return resolveRequestedSessionModeId(requestedModeId, control?.options ?? []);
}

function computeLegacyRequestedModeIdFromPermissionMode(metadata: Metadata | null | undefined): string | null {
    const raw = typeof (metadata as any)?.permissionMode === 'string' ? String((metadata as any).permissionMode) : '';
    const intent = raw ? parsePermissionIntentAlias(raw) : null;
    return intent === 'plan' ? 'plan' : null;
}

function computeStaticSessionModePickerControl(params: {
    agentId: AgentId;
    metadata: Metadata | null | undefined;
}): SessionModePickerControl | null {
    const core = getAgentCore(params.agentId);
    if (core.sessionModes.kind !== 'staticAgentModes') return null;
    const staticOptionsRaw = core.sessionModes.staticOptions ?? [];
    if (!Array.isArray(staticOptionsRaw) || staticOptionsRaw.length === 0) return null;

    const rawOptions: SessionModeOption[] = staticOptionsRaw
        .filter((opt) => opt && typeof opt.id === 'string' && typeof opt.nameKey === 'string')
        .map((opt) => ({
            id: opt.id,
            name: tLoose(opt.nameKey),
            ...(typeof opt.descriptionKey === 'string' ? { description: tLoose(opt.descriptionKey) } : {}),
        }))
        .filter((opt) => opt.id.trim().length > 0 && opt.name.trim().length > 0);

    const options = normalizeSessionModeOptions(rawOptions);
    const defaultOption = options.find((o) => o.id === 'default') ?? null;
    if (!defaultOption) return null;

    const modeOverride = readSessionModeOverrideState(params.metadata);
    const legacy = computeLegacyRequestedModeIdFromPermissionMode(params.metadata);
    const requestedModeId = modeOverride
        ? (modeOverride.state === 'set' ? modeOverride.value : null)
        : legacy ?? null;
    const requestedMode = requestedModeId ? options.find((mode) => mode.id === requestedModeId) ?? null : null;

    const currentModeId = 'default';
    const currentModeName = defaultOption.name;
    const effectiveModeId = requestedModeId ?? currentModeId;
    const effectiveMode = options.find((mode) => mode.id === effectiveModeId) ?? defaultOption;

    // Static modes have no provider-ack current mode signal, so we cannot report a meaningful pending state.
    const isPending = false;

    return {
        options,
        currentModeId,
        currentModeName,
        requestedModeId,
        requestedModeName: requestedMode ? requestedMode.name : (requestedModeId ? resolveSessionModeDisplayName(requestedModeId) : null),
        effectiveModeId,
        effectiveModeName: effectiveMode ? effectiveMode.name : resolveSessionModeDisplayName(effectiveModeId),
        isPending,
    };
}

function computeDynamicSessionModePickerControlInternal(params: {
    agentId: AgentId;
    metadata: Metadata | null | undefined;
}): SessionModePickerControl | null {
    const kind = getAgentCore(params.agentId).sessionModes.kind;
    if (kind !== 'acpAgentModes' && kind !== 'acpPolicyPresets') return null;

    const state = readSessionModesState(params.metadata);
    if (!state) return null;
    if (state.provider !== params.agentId) return null;
    if (state.availableModes.length === 0) return null;

    const options = normalizeSessionModeOptions(state.availableModes);
    const currentModeId = state.currentModeId;
    if (!currentModeId) return null;

    const modeOverride = readSessionModeOverrideState(params.metadata);
    const legacy = computeLegacyRequestedModeIdFromPermissionMode(params.metadata);
    const requestedModeId = modeOverride
        ? (modeOverride.state === 'set' ? modeOverride.value : null)
        : legacy ?? null;
    const effectiveModeId = requestedModeId ?? currentModeId;

    const currentMode = options.find((mode) => mode.id === currentModeId) ?? null;
    const requestedMode = requestedModeId ? options.find((mode) => mode.id === requestedModeId) ?? null : null;
    const effectiveMode = options.find((mode) => mode.id === effectiveModeId) ?? null;
    const isPending = Boolean(requestedModeId && currentModeId && requestedModeId !== currentModeId);

    return {
        options,
        currentModeId,
        currentModeName: currentMode ? currentMode.name : resolveSessionModeDisplayName(currentModeId),
        requestedModeId,
        requestedModeName: requestedMode ? requestedMode.name : (requestedModeId ? resolveSessionModeDisplayName(requestedModeId) : null),
        effectiveModeId,
        effectiveModeName: effectiveMode ? effectiveMode.name : resolveSessionModeDisplayName(effectiveModeId),
        isPending,
    };
}

export function computeSessionModePickerControl(params: {
    agentId: AgentId;
    metadata: Metadata | null | undefined;
}): SessionModePickerControl | null {
    if (!supportsSessionModeOverrides(params.agentId)) return null;
    return computeDynamicSessionModePickerControlInternal(params) ?? computeStaticSessionModePickerControl(params);
}
