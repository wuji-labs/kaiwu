import { describe, expect, it, vi } from 'vitest';

import { createCliActionOptionProviderRegistry } from './actionOptionProviderRegistry';

describe('createCliActionOptionProviderRegistry', () => {
  it('matches model-scoped options by the exact opaque model identifier', async () => {
    const probeModels = vi.fn(async () => ({
      provider: 'claude' as const,
      availableModels: [
        { id: 'model-a', name: 'Plain', modelOptions: [{ id: 'plain', name: 'Plain option', type: 'select', currentValue: 'x' }] },
        { id: ' model-a ', name: 'Spaced', modelOptions: [{ id: 'spaced', name: 'Spaced option', type: 'select', currentValue: 'y' }] },
      ],
      supportsFreeform: false,
      source: 'dynamic' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels,
      probeModes: vi.fn(),
      probeConfigOptions: vi.fn(async () => ({ provider: 'claude' as const, configOptions: [], source: 'dynamic' as const })),
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsConfigOptionsList({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      modelId: ' model-a ',
    });

    expect(result.items.map((item) => item.id)).toEqual(['spaced']);
  });

  it('lists models through the backend-aware model probe', async () => {
    const probeModels = vi.fn(async () => ({
      provider: 'claude' as const,
      availableModels: [
        { id: 'default', name: 'Default' },
        { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Large reasoning model' },
      ],
      supportsFreeform: true,
      source: 'dynamic' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels,
      probeModes: vi.fn(),
      probeConfigOptions: vi.fn(),
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsModelsList({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      limit: 2,
    });

    expect(probeModels).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    }));
    expect(result).toEqual({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      items: [
        { id: 'default', label: 'Default' },
        { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', description: 'Large reasoning model' },
      ],
      supportsFreeform: true,
      source: 'dynamic',
    });
  });

  it('redacts secret-like model options from model listings', async () => {
    const probeModels = vi.fn(async () => ({
      provider: 'claude' as const,
      availableModels: [
        {
          id: 'claude-opus-4-8',
          name: 'Claude Opus 4.8',
          modelOptions: [
            {
              id: 'reasoning_effort',
              name: 'Thinking',
              type: 'select',
              currentValue: 'high',
            },
            {
              id: 'api_key',
              name: 'API key',
              type: 'password',
              currentValue: 'sk-secret',
            },
          ],
        },
      ],
      supportsFreeform: true,
      source: 'dynamic' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels,
      probeModes: vi.fn(),
      probeConfigOptions: vi.fn(),
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsModelsList({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
    });

    expect(JSON.stringify(result)).not.toContain('sk-secret');
    expect(result.items).toEqual([
      {
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        modelOptions: [
          {
            id: 'reasoning_effort',
            name: 'Thinking',
            type: 'select',
            currentValue: 'high',
          },
        ],
      },
    ]);
  });

  it('lists config options without exposing secret material', async () => {
    const probeConfigOptions = vi.fn(async () => ({
      provider: 'claude' as const,
      configOptions: [
        {
          id: 'reasoning_effort',
          name: 'Thinking',
          type: 'select',
          currentValue: 'high',
          options: [
            { value: 'high', name: 'High' },
            { value: 'xhigh', name: 'Extra high' },
          ],
        },
        {
          id: 'ultracode',
          name: 'Ultracode',
          type: 'boolean',
          currentValue: false,
        },
      ],
      source: 'dynamic' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels: vi.fn(),
      probeModes: vi.fn(),
      probeConfigOptions,
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsConfigOptionsList({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
    });

    expect(probeConfigOptions).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
      cwd: '/repo',
    }));
    expect(JSON.stringify(result)).not.toContain('token');
    expect(result).toEqual({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      items: [
        {
          id: 'reasoning_effort',
          label: 'Thinking',
          type: 'select',
          currentValue: 'high',
          options: [
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
          ],
        },
        {
          id: 'ultracode',
          label: 'Ultracode',
          type: 'boolean',
          currentValue: false,
        },
      ],
      source: 'dynamic',
    });
  });

  it('falls back to model-scoped config options when the config probe has no entries', async () => {
    const probeConfigOptions = vi.fn(async () => ({
      provider: 'claude' as const,
      configOptions: [],
      source: 'static' as const,
    }));
    const probeModels = vi.fn(async () => ({
      provider: 'claude' as const,
      availableModels: [
        {
          id: 'claude-opus-4-8',
          name: 'Claude Opus 4.8',
          modelOptions: [
            {
              id: 'reasoning_effort',
              name: 'Thinking',
              type: 'select',
              currentValue: 'high',
              options: [
                { value: 'high', name: 'High' },
                { value: 'xhigh', name: 'Extra high' },
              ],
            },
            {
              id: 'ultracode',
              name: 'Ultracode',
              description: 'Maximum reasoning with dynamic workflows',
              type: 'boolean',
              currentValue: 'false',
            },
          ],
        },
        {
          id: 'claude-haiku-4-5',
          name: 'Claude Haiku 4.5',
          modelOptions: [
            {
              id: 'reasoning_effort',
              name: 'Thinking',
              type: 'select',
              currentValue: 'medium',
              options: [
                { value: 'medium', name: 'Medium' },
              ],
            },
          ],
        },
      ],
      supportsFreeform: true,
      source: 'static' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels,
      probeModes: vi.fn(),
      probeConfigOptions,
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsConfigOptionsList({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      modelId: 'claude-opus-4-8',
    });

    expect(probeConfigOptions).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
      cwd: '/repo',
    }));
    expect(probeModels).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
      cwd: '/repo',
    }));
    expect(result).toEqual({
      agentId: 'claude',
      backendTargetKey: 'agent:claude',
      items: [
        {
          id: 'reasoning_effort',
          label: 'Thinking',
          type: 'select',
          currentValue: 'high',
          options: [
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
          ],
        },
        {
          id: 'ultracode',
          label: 'Ultracode',
          description: 'Maximum reasoning with dynamic workflows',
          type: 'boolean',
          currentValue: 'false',
        },
      ],
      source: 'static',
    });
  });

  it('lists session modes through the backend-aware mode probe', async () => {
    const probeModes = vi.fn(async () => ({
      provider: 'customAcp' as const,
      availableModes: [
        { id: 'plan', name: 'Plan' },
        { id: 'act', name: 'Act', description: 'Make edits' },
      ],
      source: 'dynamic' as const,
    }));
    const registry = createCliActionOptionProviderRegistry({
      probeModels: vi.fn(),
      probeModes,
      probeConfigOptions: vi.fn(),
      cwd: '/repo',
      credentials: null,
      accountSettings: null,
    });

    const result = await registry.agentsSessionModesList({
      agentId: 'customAcp',
      backendTargetKey: 'acpBackend:review-bot',
      limit: 1,
    });

    expect(probeModes).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'customAcp',
      backendTarget: { kind: 'configuredAcpBackend', backendId: 'review-bot' },
      cwd: '/repo',
    }));
    expect(result).toEqual({
      agentId: 'customAcp',
      backendTargetKey: 'acpBackend:review-bot',
      items: [{ id: 'plan', label: 'Plan' }],
      source: 'dynamic',
    });
  });
});
