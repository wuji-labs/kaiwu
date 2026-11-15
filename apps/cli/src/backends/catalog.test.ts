import { describe, expect, it, vi } from 'vitest';

import { AGENT_IDS, DEFAULT_AGENT_ID } from '@happier-dev/agents';
import { AGENTS_CORE } from '@happier-dev/agents';
import { buildConnectedServiceCredentialRecord } from '@happier-dev/protocol';
import type { ConnectedServicesProviderMaterializer } from '@/daemon/connectedServices/materialize/providerMaterializerTypes';

import * as catalog from './catalog';
import {
  AGENTS,
  notifyTerminalAttachmentRetiredThroughCatalog,
  getAcpForkContinuationHandler,
  getConnectedServiceMaterializer,
  getConnectedServiceStateSharingDescriptor,
  getDirectSessionProviderOps,
  getProviderAttachOps,
  getConnectedServiceRuntimeAuthAdapter,
  resolveConnectedServiceSwitchContinuity,
  getSessionUsageLimitRecoveryControlAdapter,
  getSessionGoalControlAdapter,
  getProviderNativeForkHandler,
  getVendorResumeSupport,
  resolveConnectedServiceGenerationApplicationScope,
  requireCatalogEntry,
} from './catalog';
import { DEFAULT_CATALOG_AGENT_ID } from './types';

describe('AGENTS', () => {
  it('fans exact terminal retirement out through provider-owned lifecycle hooks', async () => {
    const original = AGENTS.codex;
    const onTerminalAttachmentRetired = vi.fn(async () => {});
    AGENTS.codex = original ? { ...original, onTerminalAttachmentRetired } : original;
    try {
      const attachmentInfo = {
        version: 2 as const,
        attachmentId: 'attachment-1' as never,
        sessionId: 'session-1',
        handle: {
          attachmentId: 'attachment-1' as never,
          kind: 'tmux' as const,
          sessionName: 'host-1',
          attachMetadata: {
            attachStrategy: 'terminal_host' as const,
            topology: 'shared' as const,
            locality: 'same_machine' as const,
            liveProbe: 'required' as const,
          },
        },
        terminal: { mode: 'tmux' as const, tmux: { target: 'host-1' } },
        updatedAt: 1,
      };

      await notifyTerminalAttachmentRetiredThroughCatalog({
        happyHomeDir: '/tmp/happier',
        sessionId: 'session-1',
        attachmentInfo,
      });

      expect(onTerminalAttachmentRetired).toHaveBeenCalledWith({
        happyHomeDir: '/tmp/happier',
        sessionId: 'session-1',
        attachmentInfo,
      });
    } finally {
      AGENTS.codex = original;
    }
  });
  it('has unique cliSubcommand values', () => {
    const values = Object.values(AGENTS).map((entry) => entry.cliSubcommand);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keys match entry ids', () => {
    for (const [key, entry] of Object.entries(AGENTS)) {
      expect(key).toBe(entry.id);
    }
  });

  it('throws when requiring a missing catalog entry (no silent default fallback)', () => {
    expect(() => requireCatalogEntry('__missing__' as any)).toThrow(/missing catalog agent entry/i);
  });

  it('declares vendor resume support for every agent', () => {
    for (const entry of Object.values(AGENTS)) {
      expect(entry.vendorResumeSupport).toBeTruthy();
    }
  });

  it('matches shared agent ids', () => {
    const keys = Object.keys(AGENTS).slice().sort();
    const shared = [...AGENT_IDS].slice().sort();
    expect(keys).toEqual(shared);
  });

  it('uses the shared default agent id', () => {
    expect(DEFAULT_CATALOG_AGENT_ID).toBe(DEFAULT_AGENT_ID);
  });

  it('resolves generation application cardinality from the service-owning provider declaration', async () => {
    await expect(resolveConnectedServiceGenerationApplicationScope('claude-subscription', 'claude')).resolves.toEqual({
      status: 'supported',
      scope: 'shared_group_auth_surface',
      ownerId: 'claude',
    });
    await expect(resolveConnectedServiceGenerationApplicationScope('openai-codex', 'codex')).resolves.toEqual({
      status: 'supported',
      scope: 'per_session_runtime',
      ownerId: 'codex',
    });
  });

  it('keeps cloud connect config in sync with catalog entries', async () => {
    for (const id of AGENT_IDS) {
      const core = AGENTS_CORE[id];
      const entry = requireCatalogEntry(id);

      if (core.cloudConnect) {
        expect(entry.getCloudConnectTarget).toBeTruthy();
        const target = await entry.getCloudConnectTarget!();
        expect(target.vendorKey).toBe(core.cloudConnect.vendorKey);
        expect(target.status).toBe(core.cloudConnect.status);
      } else {
        expect(entry.getCloudConnectTarget).toBeFalsy();
      }
    }
  });

  it('forces remote starting mode for claude headless tmux sessions', async () => {
    const transform = await requireCatalogEntry('claude').getHeadlessTmuxArgvTransform!();
    expect(transform(['--foo'])).toEqual(['--foo', '--happy-starting-mode', 'remote']);
  });

  it('exposes a preflight session-controls probe adapter for claude so model-scoped options can be surfaced without ACP', async () => {
    const entry = requireCatalogEntry('claude');
    expect(entry.needsAccountSettingsForProbes).toBe(true);
    expect(entry.getPreflightSessionControlsProbeAdapter).toBeTypeOf('function');
    const adapter = await entry.getPreflightSessionControlsProbeAdapter!();
    expect(adapter).toMatchObject({
      modelProbeCachePolicy: 'provider-owned',
      probeModelsRaw: expect.any(Function),
    });
  });

  it('does not define a headless tmux argv transform for codex', () => {
    expect(requireCatalogEntry('codex').getHeadlessTmuxArgvTransform).toBeUndefined();
  });

  it('registers runnable CLI command handlers for built-in generic ACP agents', () => {
    expect(requireCatalogEntry('customAcp').getCliCommandHandler).toBeTypeOf('function');
  });

  it('loads direct-session provider ops through backend catalog hooks', async () => {
    await expect(getDirectSessionProviderOps('claude')).resolves.toMatchObject({
      listCandidates: expect.any(Function),
      pageTranscript: expect.any(Function),
      readAfterTranscript: expect.any(Function),
      getActivity: expect.any(Function),
      resolveTakeoverSpawnOptions: expect.any(Function),
    });
    await expect(getDirectSessionProviderOps('codex')).resolves.toMatchObject({
      listCandidates: expect.any(Function),
    });
  });

  it('loads provider-attach ops through backend catalog hooks only for supporting providers', async () => {
    await expect(getProviderAttachOps('claude')).resolves.toBeNull();
    await expect(getProviderAttachOps('codex')).resolves.toBeNull();
    await expect(getProviderAttachOps('gemini')).resolves.toBeNull();
  });

  it('loads connected-service runtime auth adapters through backend catalog hooks for supported providers', async () => {
    await expect(getConnectedServiceRuntimeAuthAdapter('codex')).resolves.toMatchObject({
      classifyRuntimeAuthFailure: expect.any(Function),
      canHotApply: expect.any(Function),
    });
    await expect(getConnectedServiceRuntimeAuthAdapter('claude')).resolves.toMatchObject({
      classifyRuntimeAuthFailure: expect.any(Function),
      canHotApply: expect.any(Function),
    });
    await expect(getConnectedServiceRuntimeAuthAdapter('gemini')).resolves.toMatchObject({
      classifyRuntimeAuthFailure: expect.any(Function),
      probeQuota: expect.any(Function),
    });
  });

  it('resolves provider credential lifecycle descriptors through backend catalog hooks with safe defaults', async () => {
    const catalogModule = catalog as unknown as Record<string, unknown>;
    expect(catalogModule.resolveConnectedServiceCredentialLifecycleDescriptor).toBeTypeOf('function');

    const resolveDescriptor =
      catalogModule.resolveConnectedServiceCredentialLifecycleDescriptor as (
        agentId: string,
      ) => Promise<unknown>;

    await expect(resolveDescriptor('claude')).resolves.toMatchObject({
      providerId: 'claude',
      serviceIds: expect.arrayContaining(['claude-subscription']),
      generationApplicationScope: 'shared_group_auth_surface',
      sharedGenerationApplicationServiceIds: ['claude-subscription'],
      spawnPreflightOauthRefresh: { mode: 'expiry_window' },
      refreshedCredentialApplication: {
        mode: 'restart_required',
        noRestartRequiredServiceIds: ['claude-subscription'],
      },
    });
    await expect(resolveDescriptor('codex')).resolves.toMatchObject({
      providerId: 'codex',
      generationApplicationScope: 'per_session_runtime',
      refreshedCredentialApplication: {
        mode: 'hot_apply',
      },
      runtimeAuthApply: {
        directLiveHotAuth: {
          supportsInTurnApply: true,
          requiresExactRuntimeIdentity: true,
          refreshSelectionResync: 'required',
          authMode: {
            kind: 'external_token_injection',
            surface: 'codex_chatgpt_auth_tokens',
          },
        },
      },
    });
    await expect(resolveDescriptor('gemini')).resolves.toEqual({
      providerId: 'gemini',
      serviceIds: ['gemini'],
      spawnPreflightOauthRefresh: { mode: 'expiry_window' },
      refreshedCredentialApplication: { mode: 'restart_required' },
      predictiveSoftSwitch: { mode: 'unsupported' },
      sameAccountFanoutStrategy: 'none',
      generationApplicationScope: 'per_session_runtime',
      runtimeAuthApply: { directLiveHotAuth: 'unsupported' },
    });
  });

  it('loads connected-service materializers through backend catalog hooks for providers that support connected services', async () => {
    await expect(getConnectedServiceMaterializer('codex')).resolves.toBeTypeOf('function');
    await expect(getConnectedServiceMaterializer('claude')).resolves.toBeTypeOf('function');
    await expect(getConnectedServiceMaterializer('gemini')).resolves.toBeTypeOf('function');
  });

  it('retries a rejected catalog hook load while preserving singleflight and successful caching', async () => {
    const original = AGENTS.customAcp;
    if (!original) throw new Error('Missing customAcp catalog entry');

    const recoveredMaterializer: ConnectedServicesProviderMaterializer = async () => null;
    let resolveRecovery!: (materializer: ConnectedServicesProviderMaterializer) => void;
    const recovery = new Promise<ConnectedServicesProviderMaterializer>((resolve) => {
      resolveRecovery = resolve;
    });
    const getConnectedServiceMaterializerHook = vi.fn()
      .mockRejectedValueOnce(new Error('transient catalog load failure'))
      .mockImplementationOnce(() => recovery);
    AGENTS.customAcp = {
      ...original,
      getConnectedServiceMaterializer: getConnectedServiceMaterializerHook,
    };

    try {
      await expect(getConnectedServiceMaterializer('customAcp')).rejects.toThrow('transient catalog load failure');

      const firstRetry = getConnectedServiceMaterializer('customAcp');
      const concurrentRetry = getConnectedServiceMaterializer('customAcp');
      resolveRecovery(recoveredMaterializer);
      const retryResults = await Promise.allSettled([firstRetry, concurrentRetry]);

      expect(getConnectedServiceMaterializerHook).toHaveBeenCalledTimes(2);
      expect(retryResults).toEqual([
        { status: 'fulfilled', value: recoveredMaterializer },
        { status: 'fulfilled', value: recoveredMaterializer },
      ]);
      await expect(getConnectedServiceMaterializer('customAcp')).resolves.toBe(recoveredMaterializer);
      expect(getConnectedServiceMaterializerHook).toHaveBeenCalledTimes(2);
    } finally {
      AGENTS.customAcp = original;
    }
  });

  it('resolves connected-service state sharing descriptors through optional backend catalog hooks', async () => {
    await expect(getConnectedServiceStateSharingDescriptor('codex')).resolves.toMatchObject({
      providerId: 'codex',
      providerSupportStatus: 'supported',
      config: {
        supported: true,
        modes: ['linked', 'copied', 'isolated'],
        entries: expect.arrayContaining([
          expect.objectContaining({ path: 'config.toml', mode: 'force_copied' }),
        ]),
      },
      state: {
        supported: true,
        modes: ['isolated', 'shared'],
        entries: expect.arrayContaining([
          expect.objectContaining({ path: 'sessions', mode: 'linked' }),
        ]),
        sharedStatePrivacyRiskAcknowledgementRequired: true,
        symlinkUnavailableDegradePolicy: 'degrade_to_isolated',
      },
      transforms: expect.arrayContaining([
        expect.objectContaining({
          kind: 'rewrite_toml',
          entry: 'config.toml',
        }),
      ]),
      authIsolation: {
        mode: 'materialized_home',
        secretEntries: ['auth.json', 'accounts'],
      },
    });
    await expect(getConnectedServiceStateSharingDescriptor('claude')).resolves.toMatchObject({
      providerId: 'claude',
      providerSupportStatus: 'supported',
      config: {
        supported: true,
        modes: ['linked', 'copied', 'isolated'],
        entries: expect.arrayContaining([
          expect.objectContaining({ path: 'settings.json', mode: 'linked_or_copied' }),
        ]),
      },
      state: {
        supported: true,
        modes: ['isolated', 'shared'],
        entries: expect.arrayContaining([
          expect.objectContaining({ path: 'projects', mode: 'linked' }),
        ]),
      },
      authIsolation: {
        mode: 'materialized_home',
        secretEntries: expect.arrayContaining(['CLAUDE_API_KEY']),
      },
    });
    await expect(getConnectedServiceStateSharingDescriptor('gemini')).resolves.toMatchObject({
      providerId: 'gemini',
      providerSupportStatus: 'unsupported',
      authIsolation: {
        mode: 'materialized_home',
        secretEntries: ['.gemini/oauth_creds.json'],
      },
    });
  });

  it('resolves connected-service switch continuity through optional backend catalog hooks', async () => {
    const exactContinuityContext = {
      connectedServiceMaterializationIdentityV1: {
        v: 1,
        id: 'materialization-session-1',
        createdAtMs: 1,
      },
      vendorResumeId: 'vendor-session-1',
    } as const;

    await expect(resolveConnectedServiceSwitchContinuity('claude', {
      sessionId: 'session-1',
      agentId: 'claude',
      serviceId: 'anthropic',
      previousBinding: {
        source: 'native',
        selection: 'native',
        serviceId: 'anthropic',
        profileId: null,
        groupId: null,
      },
      nextBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'anthropic',
        profileId: 'work',
        groupId: null,
      },
      fromBindings: {
        v: 1,
        bindingsByServiceId: {
          anthropic: { source: 'native' },
        },
      },
      toBindings: {
        v: 1,
        bindingsByServiceId: {
          anthropic: { source: 'connected', selection: 'profile', profileId: 'work' },
        },
      },
    })).resolves.toEqual({
      mode: 'restart_shared_state_required',
      reason: 'claude_session_state_sharing_required',
    });
    await expect(resolveConnectedServiceSwitchContinuity('codex', {
      sessionId: 'session-1',
      agentId: 'codex',
      serviceId: 'openai-codex',
      previousBinding: {
        source: 'connected',
        selection: 'group',
        serviceId: 'openai-codex',
        profileId: 'old',
        groupId: 'team',
      },
      nextBinding: {
        source: 'connected',
        selection: 'group',
        serviceId: 'openai-codex',
        profileId: 'new',
        groupId: 'team',
      },
      fromBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'group', groupId: 'team', profileId: 'old' } } },
      toBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'group', groupId: 'team', profileId: 'new' } } },
      ...exactContinuityContext,
    })).resolves.toEqual({ mode: 'hot_apply' });
    await expect(resolveConnectedServiceSwitchContinuity('codex', {
      sessionId: 'session-1',
      agentId: 'codex',
      serviceId: 'openai-codex',
      previousBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'openai-codex',
        profileId: 'old',
        groupId: null,
      },
      nextBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'openai-codex',
        profileId: 'new',
        groupId: null,
      },
      fromBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'profile', profileId: 'old' } } },
      toBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'profile', profileId: 'new' } } },
    })).resolves.toEqual({ mode: 'hot_apply' });
    await expect(resolveConnectedServiceSwitchContinuity('codex', {
      sessionId: 'session-1',
      agentId: 'codex',
      serviceId: 'openai-codex',
      previousBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'openai-codex',
        profileId: 'old',
        groupId: null,
      },
      nextBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'openai-codex',
        profileId: 'new',
        groupId: null,
      },
      fromBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'profile', profileId: 'old' } } },
      toBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'profile', profileId: 'new' } } },
      runtimeAuthSelection: {
        record: buildConnectedServiceCredentialRecord({
          now: 1,
          serviceId: 'openai-codex',
          profileId: 'new',
          kind: 'oauth',
          expiresAt: 2,
          oauth: {
            accessToken: 'access',
            refreshToken: 'refresh',
            idToken: 'id',
            scope: null,
            tokenType: null,
            providerAccountId: 'acct',
            providerEmail: null,
          },
        }),
        applyConnectedServiceAuthGeneration: async () => ({ ok: true }),
        invalidateTransports: async () => {},
        persistAuthStore: async () => {},
      },
    })).resolves.toEqual({ mode: 'hot_apply' });
    await expect(resolveConnectedServiceSwitchContinuity('codex', {
      sessionId: 'session-1',
      agentId: 'codex',
      serviceId: 'openai-codex',
      previousBinding: {
        source: 'native',
        selection: 'native',
        serviceId: 'openai-codex',
        profileId: null,
        groupId: null,
      },
      nextBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'openai-codex',
        profileId: 'new',
        groupId: null,
      },
      fromBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'native' } } },
      toBindings: { v: 1, bindingsByServiceId: { 'openai-codex': { source: 'connected', selection: 'profile', profileId: 'new' } } },
      runtimeAuthSelection: {
        record: buildConnectedServiceCredentialRecord({
          now: 1,
          serviceId: 'openai-codex',
          profileId: 'new',
          kind: 'oauth',
          expiresAt: 2,
          oauth: {
            accessToken: 'access',
            refreshToken: 'refresh',
            idToken: 'id',
            scope: null,
            tokenType: null,
            providerAccountId: 'acct',
            providerEmail: null,
          },
        }),
        invalidateTransports: async () => {},
      },
    })).resolves.toEqual({ mode: 'hot_apply' });

    await expect(resolveConnectedServiceSwitchContinuity('gemini', {
      sessionId: 'session-1',
      agentId: 'gemini',
      serviceId: 'gemini',
      previousBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'gemini',
        profileId: 'old',
        groupId: null,
      },
      nextBinding: {
        source: 'connected',
        selection: 'profile',
        serviceId: 'gemini',
        profileId: 'new',
        groupId: null,
      },
      fromBindings: { v: 1, bindingsByServiceId: { gemini: { source: 'connected', selection: 'profile', profileId: 'old' } } },
      toBindings: { v: 1, bindingsByServiceId: { gemini: { source: 'connected', selection: 'profile', profileId: 'new' } } },
      ...exactContinuityContext,
    })).resolves.toEqual({
      mode: 'restart_same_home',
      reason: 'gemini_restart_rematerialize_required',
    });
  });

  it('loads inactive goal controls through backend catalog hooks for supported providers', async () => {
    await expect(getSessionGoalControlAdapter('codex')).resolves.toMatchObject({
      setGoal: expect.any(Function),
      clearGoal: expect.any(Function),
    });
    await expect(getSessionGoalControlAdapter('claude')).resolves.toMatchObject({
      setGoal: expect.any(Function),
      clearGoal: expect.any(Function),
      getGoal: expect.any(Function),
    });
  });

  it('loads inactive usage-limit recovery control for supported providers', async () => {
    await expect(getSessionUsageLimitRecoveryControlAdapter('codex')).resolves.toMatchObject({
      checkNow: expect.any(Function),
    });
    await expect(getSessionUsageLimitRecoveryControlAdapter('gemini')).resolves.toMatchObject({
      checkNow: expect.any(Function),
    });
    await expect(getSessionUsageLimitRecoveryControlAdapter('claude')).resolves.toMatchObject({
      checkNow: expect.any(Function),
    });
  });

  it('loads provider-native fork handlers through backend catalog hooks only for supporting providers', async () => {
    await expect(getProviderNativeForkHandler('codex')).resolves.toBeTypeOf('function');
    await expect(getProviderNativeForkHandler('claude')).resolves.toBeNull();
  });

  it('loads ACP fork continuation handlers through backend catalog hooks only for supporting providers', async () => {
    await expect(getAcpForkContinuationHandler('codex')).resolves.toBeTypeOf('function');
    await expect(getAcpForkContinuationHandler('claude')).resolves.toBeNull();
  });
});
