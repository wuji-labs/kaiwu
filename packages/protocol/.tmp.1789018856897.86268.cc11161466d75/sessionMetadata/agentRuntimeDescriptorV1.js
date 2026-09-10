import { z } from 'zod';
import { normalizeCodexBackendMode } from '../providers/codex/backendMode.js';
import { normalizeOpenCodeBackendMode } from '../providers/opencode/backendMode.js';
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function normalizeTrimmedString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
}
function normalizeCodexHome(value) {
    return value === 'user' || value === 'connectedService' ? value : null;
}
function normalizeOpenCodeServerBaseUrlExplicit(value) {
    return value === true;
}
function normalizePiResumeStrategy(value) {
    return value === 'sessionFileBySessionId' || value === 'sessionFileAbsolutePreferred'
        ? value
        : null;
}
function readCanonicalCodexProviderExtra(value) {
    const extra = asRecord(value);
    if (!extra || extra.v !== 1)
        return null;
    const runtimeAffinity = asRecord(extra.runtimeAffinity);
    if (!runtimeAffinity)
        return null;
    const home = normalizeCodexHome(runtimeAffinity.home);
    return {
        backendMode: normalizeCodexBackendMode(runtimeAffinity.backendMode),
        vendorSessionId: normalizeTrimmedString(runtimeAffinity.vendorSessionId),
        home,
        connectedServiceId: home === 'connectedService' ? normalizeTrimmedString(runtimeAffinity.connectedServiceId) : null,
        connectedServiceProfileId: home === 'connectedService'
            ? normalizeTrimmedString(runtimeAffinity.connectedServiceProfileId)
            : null,
        connectedServiceGroupId: home === 'connectedService'
            ? normalizeTrimmedString(runtimeAffinity.connectedServiceGroupId)
            : null,
        homePath: normalizeTrimmedString(runtimeAffinity.homePath),
        sqliteHomePath: normalizeTrimmedString(runtimeAffinity.sqliteHomePath),
    };
}
function readCanonicalOpenCodeProviderExtra(value) {
    const extra = asRecord(value);
    if (!extra || extra.v !== 1)
        return null;
    const runtimeHandle = asRecord(extra.runtimeHandle);
    if (!runtimeHandle)
        return null;
    return {
        backendMode: normalizeOpenCodeBackendMode(runtimeHandle.backendMode),
        vendorSessionId: normalizeTrimmedString(runtimeHandle.vendorSessionId),
        serverBaseUrl: normalizeTrimmedString(runtimeHandle.serverBaseUrl),
        serverBaseUrlExplicit: normalizeOpenCodeServerBaseUrlExplicit(runtimeHandle.serverBaseUrlExplicit),
    };
}
function createAgentRuntimeDescriptorProviderSchema(zod) {
    return zod.object({
        providerExtra: createAgentRuntimeDescriptorProviderExtraV1Schema(zod).optional(),
    }).passthrough();
}
function createAgentRuntimeDescriptorProviderExtraV1Schema(zod) {
    return zod.object({
        owner: zod.string().min(1),
        schemaId: zod.string().min(1),
        v: zod.number().int().min(1),
    }).passthrough();
}
export function createAgentRuntimeDescriptorV1Schema(zod) {
    return zod.object({
        v: zod.literal(1),
        providerId: zod.string().min(1),
        provider: createAgentRuntimeDescriptorProviderSchema(zod),
    }).passthrough();
}
export const AgentRuntimeDescriptorV1Schema = createAgentRuntimeDescriptorV1Schema(z);
function buildCodexRuntimeAffinityProviderExtra(params) {
    return {
        owner: 'codex',
        schemaId: 'codex.agentRuntimeDescriptorExtra',
        v: 1,
        runtimeAffinity: {
            backendMode: params.backendMode,
            ...(params.vendorSessionId ? { vendorSessionId: params.vendorSessionId } : {}),
            ...(params.homePath ? { homePath: params.homePath } : {}),
            ...(params.sqliteHomePath ? { sqliteHomePath: params.sqliteHomePath } : {}),
            ...(params.home ? { home: params.home } : {}),
            ...(params.home === 'connectedService' && params.connectedServiceId
                ? { connectedServiceId: params.connectedServiceId }
                : {}),
            ...(params.home === 'connectedService' && params.connectedServiceProfileId
                ? { connectedServiceProfileId: params.connectedServiceProfileId }
                : {}),
            ...(params.home === 'connectedService' && params.connectedServiceGroupId
                ? { connectedServiceGroupId: params.connectedServiceGroupId }
                : {}),
        },
    };
}
export function buildCodexAgentRuntimeDescriptorV1(params) {
    return {
        v: 1,
        providerId: 'codex',
        provider: {
            backendMode: params.backendMode,
            ...(params.vendorSessionId ? { vendorSessionId: params.vendorSessionId } : {}),
            ...(params.homePath ? { homePath: params.homePath } : {}),
            ...(params.home ? { home: params.home } : {}),
            ...(params.home === 'connectedService' && params.connectedServiceId
                ? { connectedServiceId: params.connectedServiceId }
                : {}),
            ...(params.home === 'connectedService' && params.connectedServiceProfileId
                ? { connectedServiceProfileId: params.connectedServiceProfileId }
                : {}),
            ...(params.home === 'connectedService' && params.connectedServiceGroupId
                ? { connectedServiceGroupId: params.connectedServiceGroupId }
                : {}),
            providerExtra: buildCodexRuntimeAffinityProviderExtra(params),
        },
    };
}
export function buildOpenCodeAgentRuntimeDescriptorV1(params) {
    const providerExtraRuntimeHandle = {
        backendMode: params.backendMode,
        ...(params.vendorSessionId ? { vendorSessionId: params.vendorSessionId } : {}),
        ...(params.serverBaseUrl ? { serverBaseUrl: params.serverBaseUrl } : {}),
        ...(params.serverBaseUrlExplicit ? { serverBaseUrlExplicit: true } : {}),
    };
    return {
        v: 1,
        providerId: 'opencode',
        provider: {
            backendMode: params.backendMode,
            ...(params.vendorSessionId ? { vendorSessionId: params.vendorSessionId } : {}),
            ...(params.serverBaseUrl ? { serverBaseUrl: params.serverBaseUrl } : {}),
            ...(params.serverBaseUrlExplicit ? { serverBaseUrlExplicit: true } : {}),
            providerExtra: {
                owner: 'opencode',
                schemaId: 'opencode.agentRuntimeDescriptorExtra',
                v: 1,
                runtimeHandle: providerExtraRuntimeHandle,
            },
        },
    };
}
export function buildPiAgentRuntimeDescriptorV1(params) {
    return {
        v: 1,
        providerId: 'pi',
        provider: {
            resumeStrategy: params.resumeStrategy,
            ...(params.vendorSessionId ? { vendorSessionId: params.vendorSessionId } : {}),
            ...(params.sessionFile ? { sessionFile: params.sessionFile } : {}),
        },
    };
}
export function readAgentRuntimeDescriptorV1(value) {
    const parsed = AgentRuntimeDescriptorV1Schema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
export function readAgentRuntimeDescriptorV1ForProvider(value, providerId) {
    const parsed = readAgentRuntimeDescriptorV1(value);
    return parsed?.providerId === providerId ? parsed : null;
}
export function readCanonicalAgentRuntimeDescriptorV1ForProvider(value, providerId) {
    switch (providerId) {
        case 'codex': {
            const descriptor = readAgentRuntimeDescriptorV1ForProvider(value, 'codex');
            if (!descriptor)
                return null;
            const providerExtra = readCanonicalCodexProviderExtra(descriptor.provider.providerExtra);
            const home = providerExtra?.home ?? normalizeCodexHome(descriptor.provider.home);
            return {
                providerId: 'codex',
                backendMode: providerExtra?.backendMode ?? normalizeCodexBackendMode(descriptor.provider.backendMode),
                vendorSessionId: providerExtra?.vendorSessionId ?? normalizeTrimmedString(descriptor.provider.vendorSessionId),
                home,
                connectedServiceId: providerExtra?.connectedServiceId
                    ?? (home === 'connectedService' ? normalizeTrimmedString(descriptor.provider.connectedServiceId) : null),
                connectedServiceProfileId: providerExtra?.connectedServiceProfileId
                    ?? (home === 'connectedService' ? normalizeTrimmedString(descriptor.provider.connectedServiceProfileId) : null),
                connectedServiceGroupId: providerExtra?.connectedServiceGroupId
                    ?? (home === 'connectedService' ? normalizeTrimmedString(descriptor.provider.connectedServiceGroupId) : null),
                homePath: providerExtra?.homePath ?? normalizeTrimmedString(descriptor.provider.homePath),
                sqliteHomePath: providerExtra?.sqliteHomePath ?? normalizeTrimmedString(descriptor.provider.sqliteHomePath),
            };
        }
        case 'opencode': {
            const descriptor = readAgentRuntimeDescriptorV1ForProvider(value, 'opencode');
            if (!descriptor)
                return null;
            const providerExtra = readCanonicalOpenCodeProviderExtra(descriptor.provider.providerExtra);
            return {
                providerId: 'opencode',
                backendMode: providerExtra?.backendMode ?? normalizeOpenCodeBackendMode(descriptor.provider.backendMode),
                vendorSessionId: providerExtra?.vendorSessionId ?? normalizeTrimmedString(descriptor.provider.vendorSessionId),
                serverBaseUrl: providerExtra?.serverBaseUrl ?? normalizeTrimmedString(descriptor.provider.serverBaseUrl),
                serverBaseUrlExplicit: providerExtra?.serverBaseUrlExplicit ?? normalizeOpenCodeServerBaseUrlExplicit(descriptor.provider.serverBaseUrlExplicit),
            };
        }
        case 'pi': {
            const descriptor = readAgentRuntimeDescriptorV1ForProvider(value, 'pi');
            if (!descriptor)
                return null;
            return {
                providerId: 'pi',
                resumeStrategy: normalizePiResumeStrategy(descriptor.provider.resumeStrategy),
                vendorSessionId: normalizeTrimmedString(descriptor.provider.vendorSessionId),
                sessionFile: normalizeTrimmedString(descriptor.provider.sessionFile),
            };
        }
    }
}
//# sourceMappingURL=agentRuntimeDescriptorV1.js.map