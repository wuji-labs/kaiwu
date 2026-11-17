import { beforeEach, describe, expect, it, vi } from 'vitest';
import { delimiter } from 'node:path';

const {
  buildAcpCapabilitySnapshot,
  probeAcpAgentCapabilities,
  requireProviderCliLaunchSpec,
  resolveAcpProbeTimeoutMs,
} = vi.hoisted(() => ({
  buildAcpCapabilitySnapshot: vi.fn(() => ({ ok: true, loadSession: true })),
  probeAcpAgentCapabilities: vi.fn(),
  requireProviderCliLaunchSpec: vi.fn(),
  resolveAcpProbeTimeoutMs: vi.fn(() => 12_345),
}));

vi.mock('@/capabilities/probes/acpCapabilitySnapshot', () => ({
  buildAcpCapabilitySnapshot,
}));

vi.mock('@/capabilities/probes/acpProbe', () => ({
  probeAcpAgentCapabilities,
}));

vi.mock('@/capabilities/utils/acpProbeTimeout', () => ({
  resolveAcpProbeTimeoutMs,
}));

vi.mock('@/runtime/managedTools/requireProviderCliLaunchSpec', () => ({
  requireProviderCliLaunchSpec,
}));

import { createAcpCliCapability } from './createAcpCliCapability';

describe('createAcpCliCapability', () => {
  beforeEach(() => {
    buildAcpCapabilitySnapshot.mockClear();
    probeAcpAgentCapabilities.mockReset();
    requireProviderCliLaunchSpec.mockReset();
    resolveAcpProbeTimeoutMs.mockClear();
    probeAcpAgentCapabilities.mockResolvedValue({
      ok: true,
      capabilities: { loadSession: true },
    });
    requireProviderCliLaunchSpec.mockReturnValue({
      source: 'managed',
      resolvedPath: '/tmp/gemini.js',
      command: '/runtime/node',
      args: ['/tmp/gemini.js'],
    });
  });

  it('uses the canonical provider launch command for ACP probing when the CLI needs a runtime wrapper', async () => {
    const capability = createAcpCliCapability({
      agentId: 'gemini' as const,
      title: 'Gemini CLI',
      acpArgs: ['--acp'],
      transport: {
        agentName: 'gemini',
        getInitTimeout: () => 500,
        getToolPatterns: () => [],
      },
      resolveAcpProbeArgs: async () => ['--experimental-acp'],
    });

    const result = await capability.detect?.({
      request: { id: 'cli.gemini', params: { includeAcpCapabilities: true } },
      context: {
        cliSnapshot: {
          path: process.env.PATH ?? null,
          clis: {
            gemini: { available: true, resolvedPath: '/tmp/gemini.js' },
          },
        },
      },
    } as never);

    expect(probeAcpAgentCapabilities).toHaveBeenCalledWith(expect.objectContaining({
      command: '/runtime/node',
      args: ['/tmp/gemini.js', '--experimental-acp'],
      timeoutMs: 12_345,
    }));
    expect(buildAcpCapabilitySnapshot).toHaveBeenCalledWith({
      ok: true,
      capabilities: { loadSession: true },
    });
    expect(result).toMatchObject({
      available: true,
      resolvedPath: '/tmp/gemini.js',
      acp: { ok: true, loadSession: true },
    });
  });

  it('allows provider-owned ACP probes to augment the child environment', async () => {
    const capability = createAcpCliCapability({
      agentId: 'customAcp' as const,
      title: 'Custom ACP',
      acpArgs: ['acp'],
      transport: {
        agentName: 'customAcp',
        getInitTimeout: () => 500,
        getToolPatterns: () => [],
      },
      resolveAcpProbeEnv: ({ defaultEnv }) => ({
        ...defaultEnv,
        PYTHONPATH: '/tmp/custom-acp-selector-shim',
      }),
    });

    await capability.detect?.({
      request: { id: 'cli.customAcp', params: { includeAcpCapabilities: true } },
      context: {
        cliSnapshot: {
          path: process.env.PATH ?? null,
          clis: {
            customAcp: { available: true, resolvedPath: '/tmp/gemini.js' },
          },
        },
      },
    } as never);

    expect(probeAcpAgentCapabilities).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        PYTHONPATH: '/tmp/custom-acp-selector-shim',
      }),
    }));
  });

});
