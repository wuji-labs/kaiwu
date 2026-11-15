import { readAgentRuntimeDescriptorV1ForProvider } from '@happier-dev/protocol';

import { normalizeCodexBackendMode, type CodexBackendMode } from '../providerSettings/definitions/codex.js';
import {
  buildCodexRuntimeDescriptorProviderExtra,
  readCodexRuntimeDescriptorProviderExtra,
} from './codexRuntimeDescriptorExtra.js';
type SupportedRuntimeDescriptorProviderId = 'codex';

export type SessionMetadataConnectedServiceBinding = Readonly<
  | { source: 'native' }
  | {
      source: 'connected';
      selection: 'profile';
      profileId: string;
    }
  | {
      source: 'connected';
      selection: 'group';
      groupId: string;
      profileId?: string;
    }
>;

type SharedRuntimeDescriptorByProviderId = {
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
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeCodexHome(value: unknown): 'user' | 'connectedService' | null {
  return value === 'user' || value === 'connectedService' ? value : null;
}

export function buildCodexAgentRuntimeDescriptor(params: Readonly<{
  backendMode: CodexBackendMode;
  vendorSessionId?: string | null;
  home?: 'user' | 'connectedService' | null;
  connectedServiceId?: string | null;
  connectedServiceProfileId?: string | null;
  connectedServiceGroupId?: string | null;
  homePath?: string | null;
  sqliteHomePath?: string | null;
}>): Readonly<{
  v: 1;
  providerId: 'codex';
  provider: {
    backendMode: CodexBackendMode;
    vendorSessionId?: string;
    home?: 'user' | 'connectedService';
    connectedServiceId?: string;
    connectedServiceProfileId?: string;
    connectedServiceGroupId?: string;
    homePath?: string;
    providerExtra: {
      owner: 'codex';
      schemaId: 'codex.agentRuntimeDescriptorExtra';
      v: 1;
      runtimeAffinity?: {
        backendMode?: CodexBackendMode;
        vendorSessionId?: string;
        home?: 'user' | 'connectedService';
        connectedServiceId?: string;
        connectedServiceProfileId?: string;
        connectedServiceGroupId?: string;
        homePath?: string;
        sqliteHomePath?: string;
      };
    };
  };
}> {
  const vendorSessionId = normalizeTrimmedString(params.vendorSessionId);
  const home = normalizeCodexHome(params.home);
  const connectedServiceId = home === 'connectedService' ? normalizeTrimmedString(params.connectedServiceId) : null;
  const connectedServiceProfileId = home === 'connectedService'
    ? normalizeTrimmedString(params.connectedServiceProfileId)
    : null;
  const connectedServiceGroupId = home === 'connectedService'
    ? normalizeTrimmedString(params.connectedServiceGroupId)
    : null;
  const homePath = normalizeTrimmedString(params.homePath);
  const sqliteHomePath = normalizeTrimmedString(params.sqliteHomePath);

  return {
    v: 1,
    providerId: 'codex',
    provider: {
      backendMode: params.backendMode,
      ...(vendorSessionId ? { vendorSessionId } : {}),
      ...(home ? { home } : {}),
      ...(connectedServiceId ? { connectedServiceId } : {}),
      ...(connectedServiceProfileId ? { connectedServiceProfileId } : {}),
      ...(connectedServiceGroupId ? { connectedServiceGroupId } : {}),
      ...(homePath ? { homePath } : {}),
      providerExtra: {
        owner: 'codex',
        schemaId: 'codex.agentRuntimeDescriptorExtra',
        ...buildCodexRuntimeDescriptorProviderExtra({
          backendMode: params.backendMode,
          vendorSessionId,
          home,
          connectedServiceId,
          connectedServiceProfileId,
          connectedServiceGroupId,
          homePath,
          sqliteHomePath,
        }),
      },
    },
  };
}

function normalizeCodexConnectedServiceFields(params: Readonly<{
  home: 'user' | 'connectedService' | null;
  connectedServiceId: string | null;
  connectedServiceProfileId: string | null;
  connectedServiceGroupId: string | null;
  homePath: string | null;
}>): Readonly<{
  connectedServiceId: string | null;
  connectedServiceProfileId: string | null;
  connectedServiceGroupId: string | null;
  homePath: string | null;
}> {
  if (params.home === 'connectedService') {
    return {
      connectedServiceId: params.connectedServiceId,
      connectedServiceProfileId: params.connectedServiceProfileId,
      connectedServiceGroupId: params.connectedServiceGroupId,
      homePath: params.homePath,
    };
  }
  return {
    connectedServiceId: null,
    connectedServiceProfileId: null,
    connectedServiceGroupId: null,
    homePath: params.homePath,
  };
}

export function readSessionMetadataRuntimeDescriptor(
  metadata: unknown,
  providerId: 'codex',
): SharedRuntimeDescriptorByProviderId['codex'] | null;
export function readSessionMetadataRuntimeDescriptor(
  metadata: unknown,
  providerId: SupportedRuntimeDescriptorProviderId,
  ): SharedRuntimeDescriptorByProviderId[SupportedRuntimeDescriptorProviderId] | null {
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) return null;

  switch (providerId) {
    case 'codex': {
      const rawDescriptor = asRecord(metadataRecord.agentRuntimeDescriptorV1);
      const rawProvider = rawDescriptor?.providerId === 'codex' ? asRecord(rawDescriptor.provider) : null;
      const descriptor = readAgentRuntimeDescriptorV1ForProvider(metadataRecord.agentRuntimeDescriptorV1, 'codex');
      const providerExtra = readCodexRuntimeDescriptorProviderExtra(rawProvider?.providerExtra);
      const provider = descriptor?.provider ?? rawProvider;
      if (!provider) return null;

      const home = providerExtra?.home ?? normalizeCodexHome(provider.home);
      const codexConnectedServiceFields = normalizeCodexConnectedServiceFields({
        home,
        connectedServiceId: providerExtra?.connectedServiceId ?? normalizeTrimmedString(provider.connectedServiceId),
        connectedServiceProfileId: providerExtra?.connectedServiceProfileId ?? normalizeTrimmedString(provider.connectedServiceProfileId),
        connectedServiceGroupId: providerExtra?.connectedServiceGroupId ?? normalizeTrimmedString(provider.connectedServiceGroupId),
        homePath: providerExtra?.homePath ?? normalizeTrimmedString(provider.homePath),
      });

      return {
        providerId: 'codex',
        backendMode: providerExtra?.backendMode ?? normalizeCodexBackendMode(provider.backendMode),
        vendorSessionId: providerExtra?.vendorSessionId ?? normalizeTrimmedString(provider.vendorSessionId),
        home,
        connectedServiceId: codexConnectedServiceFields.connectedServiceId,
        connectedServiceProfileId: codexConnectedServiceFields.connectedServiceProfileId,
        connectedServiceGroupId: codexConnectedServiceFields.connectedServiceGroupId,
        homePath: codexConnectedServiceFields.homePath,
        sqliteHomePath: providerExtra?.sqliteHomePath ?? normalizeTrimmedString(rawProvider?.sqliteHomePath),
      };
    }
  }
}
