import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createCatalogAcpBackendMock } = vi.hoisted(() => ({
  createCatalogAcpBackendMock: vi.fn(),
}));

vi.mock('@/agent/acp/createCatalogAcpBackend', () => ({
  createCatalogAcpBackend: createCatalogAcpBackendMock,
}));

const { validateCatalogAcpProbeSpawnMock } = vi.hoisted(() => ({
  validateCatalogAcpProbeSpawnMock: vi.fn(async () => ({ ok: false })),
}));

vi.mock('./validateCatalogAcpProbeSpawn', () => ({
  validateCatalogAcpProbeSpawn: validateCatalogAcpProbeSpawnMock,
}));

const { createConfiguredAcpProbeBackendMock } = vi.hoisted(() => ({
  createConfiguredAcpProbeBackendMock: vi.fn(async () => null),
}));

const { claudePreflightModelsProbeMock } = vi.hoisted(() => ({
  claudePreflightModelsProbeMock: vi.fn(async (): Promise<unknown | null> => null),
}));

vi.mock('./createConfiguredAcpProbeBackend', () => ({
  createConfiguredAcpProbeBackend: createConfiguredAcpProbeBackendMock,
}));

vi.mock('@/backends/catalog', () => ({
  AGENTS: {
    claude: {
      getPreflightSessionControlsProbeAdapter: async () => ({
        probeModelsRaw: claudePreflightModelsProbeMock,
      }),
    },
  },
}));

import { probeAgentModelsBestEffort, resetAgentModelsProbeCacheForTests } from './agentModelsProbe';

describe('probeAgentModelsBestEffort (static-only providers)', () => {
  beforeEach(() => {
    resetAgentModelsProbeCacheForTests();
    createCatalogAcpBackendMock.mockReset();
    validateCatalogAcpProbeSpawnMock.mockClear();
    createConfiguredAcpProbeBackendMock.mockClear();
    claudePreflightModelsProbeMock.mockReset();
    claudePreflightModelsProbeMock.mockResolvedValue(null);
  });

  it('falls back to curated static Claude model labels when dynamic probing is unavailable', async () => {
    const res = await probeAgentModelsBestEffort({
      agentId: 'claude',
      cwd: process.cwd(),
      timeoutMs: 100,
    });

    expect(res.provider).toBe('claude');
    expect(res.source).toBe('static');

    expect(res.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'default', name: 'Default' }),
      expect.objectContaining({
        id: 'claude-fable-5',
        name: 'Fable 5',
        description: expect.any(String),
        contextWindowTokens: 1_000_000,
      }),
      expect.objectContaining({
        id: 'claude-opus-4-8',
        name: 'Opus 4.8',
        description: expect.any(String),
        contextWindowTokens: 1_000_000,
      }),
      expect.objectContaining({
        id: 'claude-opus-4-7',
        name: 'Opus 4.7',
        description: expect.any(String),
        contextWindowTokens: 1_000_000,
      }),
      expect.objectContaining({
        id: 'claude-opus-4-6',
        name: 'Opus 4.6',
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'claude-sonnet-4-6',
        name: 'Sonnet 4.6',
        description: expect.any(String),
        extendedContextModelId: 'claude-sonnet-4-6[1m]',
      }),
    ]));

    const fable = res.availableModels.find((model) => model.id === 'claude-fable-5') ?? null;
    expect(fable?.modelOptions?.some((opt) => opt.id === 'reasoning_effort')).toBe(true);
    expect(fable?.modelOptions?.[0]?.currentValue).toBe('high');
    expect(fable?.modelOptions?.[0]?.options?.some((opt) => opt.value === 'xhigh')).toBe(true);
    expect(fable?.modelOptions?.[0]?.options?.some((opt) => opt.value === 'max')).toBe(true);
    expect(createCatalogAcpBackendMock).not.toHaveBeenCalled();
  });

  it('preserves an extended-context model id returned by a dynamic probe', async () => {
    claudePreflightModelsProbeMock.mockResolvedValue([{
      id: 'claude-opus-9',
      name: 'Opus 9',
      extendedContextModelId: 'claude-opus-9[1m]',
    }]);

    const res = await probeAgentModelsBestEffort({
      agentId: 'claude',
      cwd: process.cwd(),
      timeoutMs: 100,
    });

    expect(res.source).toBe('dynamic');
    expect(res.availableModels.find((model) => model.id === 'claude-opus-9'))
      .toMatchObject({ extendedContextModelId: 'claude-opus-9[1m]' });
  });

  it('treats an empty provider-owned model array as authoritative instead of restoring static rows', async () => {
    claudePreflightModelsProbeMock.mockResolvedValue([]);

    const res = await probeAgentModelsBestEffort({
      agentId: 'claude',
      cwd: process.cwd(),
      timeoutMs: 100,
    });

    expect(res).toMatchObject({
      provider: 'claude',
      source: 'dynamic',
      availableModels: [{ id: 'default', name: 'Default' }],
    });
  });

  it('falls back only to the default Codex model when dynamic probing is unavailable', async () => {
    const res = await probeAgentModelsBestEffort({
      agentId: 'codex',
      cwd: process.cwd(),
      timeoutMs: 100,
    });

    expect(res.provider).toBe('codex');
    expect(res.source).toBe('static');
    expect(res.availableModels).toEqual([{ id: 'default', name: 'Default' }]);
  });
});
