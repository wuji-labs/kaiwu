import { describe, expect, it, vi } from 'vitest';

import { AcpBackend, type AcpBackendOptions, type AcpPermissionHandler } from '@/agent/acp/AcpBackend';
import type { AgentBackend } from '@/agent/core';
import { probeAgentModelsBestEffort, probeModelsFromAcpBackend } from './agentModelsProbe';
import { createApprovedPermissionHandler } from '@/testkit/backends/permissionHandler';
import {
  createProbeTempDir,
  resolveAcpSdkEntryFromCwd,
  writeFakeAcpAgentScript,
} from './agentModelsProbe.testkit';

function createProbeBackendOptions(params: {
  cwd: string;
  agentPath: string;
  permissionHandler?: AcpPermissionHandler;
}): AcpBackendOptions {
  return {
    agentName: 'fake',
    cwd: params.cwd,
    command: process.execPath,
    args: [params.agentPath],
    env: { NODE_ENV: 'production' },
    permissionHandler: params.permissionHandler ?? createApprovedPermissionHandler(),
  };
}

type ProbeBackendLike = Pick<AgentBackend, 'startSession'> & {
  getSessionModelState: () => unknown;
  getSessionConfigOptionsState: () => unknown;
};

describe('probeModelsFromAcpBackend', () => {
  it('extracts available models from ACP session/new and normalizes Default', async () => {
    const fixture = await createProbeTempDir('happier-acp-model-probe');
    const sdkEntry = resolveAcpSdkEntryFromCwd(process.cwd());

    const agentPath = await writeFakeAcpAgentScript({
      dir: fixture.dir,
      sdkEntry,
      sessionPayloadSource: `{
      sessionId: randomUUID(),
      models: {
        currentModelId: "model-a",
        availableModels: [
          { id: "model-a", name: "Model A" },
          { id: "model-b", name: "Model B" },
        ],
      },
    }`,
    });

    const backend = new AcpBackend(
      createProbeBackendOptions({
        cwd: fixture.dir,
        agentPath,
      }),
    );
    try {
      const models = await probeModelsFromAcpBackend({ backend, timeoutMs: 10_000 });
      expect(models).not.toBeNull();
      expect(models?.[0]).toEqual({ id: 'default', name: 'Default' });
      expect(models?.some((m) => m.id === 'model-a' && m.name === 'Model A')).toBe(true);
      expect(models?.some((m) => m.id === 'model-b' && m.name === 'Model B')).toBe(true);
    } finally {
      await backend.dispose().catch(() => {});
      await fixture.cleanup();
    }
  }, 20_000);

  it('extracts Kimi-style modelId entries from ACP session/new', async () => {
    const fixture = await createProbeTempDir('happier-acp-kimi-model-probe');
    const sdkEntry = resolveAcpSdkEntryFromCwd(process.cwd());

    const agentPath = await writeFakeAcpAgentScript({
      dir: fixture.dir,
      sdkEntry,
      sessionPayloadSource: `{
      sessionId: randomUUID(),
      models: {
        currentModelId: "kimi-code/kimi-for-coding,thinking",
        availableModels: [
          { modelId: "kimi-code/kimi-for-coding", name: "kimi-for-coding" },
          { modelId: "kimi-code/kimi-for-coding,thinking", name: "kimi-for-coding (thinking)" },
        ],
      },
    }`,
    });

    const backend = new AcpBackend(
      createProbeBackendOptions({
        cwd: fixture.dir,
        agentPath,
      }),
    );
    try {
      const models = await probeModelsFromAcpBackend({ backend, timeoutMs: 10_000 });
      expect(models).toEqual([
        { id: 'default', name: 'Default' },
        { id: 'kimi-code/kimi-for-coding', name: 'kimi-for-coding' },
        { id: 'kimi-code/kimi-for-coding,thinking', name: 'kimi-for-coding (thinking)' },
      ]);
    } finally {
      await backend.dispose().catch(() => {});
      await fixture.cleanup();
    }
  }, 20_000);

  it('extracts available models from ACP session/new configOptions when models are absent', async () => {
    const fixture = await createProbeTempDir('happier-acp-model-probe-config');
    const sdkEntry = resolveAcpSdkEntryFromCwd(process.cwd());

    const agentPath = await writeFakeAcpAgentScript({
      dir: fixture.dir,
      sdkEntry,
      sessionPayloadSource: `{
      sessionId: randomUUID(),
      configOptions: [
        {
          id: "cursor-choice",
          name: "Cursor Choice",
          category: "model",
          type: "enum",
          currentValue: "model-a",
          options: [
            { value: "model-a", name: "Model A" },
            { value: "model-b", name: "Model B" },
          ],
        },
        {
          id: "fast",
          name: "Fast",
          category: "model_config",
          type: "select",
          currentValue: "true",
          options: [
            { value: "false", name: "Off" },
            { value: "true", name: "Fast" },
          ],
        },
      ],
    }`,
    });

    const backend = new AcpBackend(
      createProbeBackendOptions({
        cwd: fixture.dir,
        agentPath,
      }),
    );
    try {
      const models = await probeModelsFromAcpBackend({ backend, timeoutMs: 10_000 });
      expect(models).not.toBeNull();
      expect(models?.[0]).toEqual({ id: 'default', name: 'Default' });
      expect(models?.some((m) => m.id === 'model-a' && m.name === 'Model A')).toBe(true);
      expect(models?.some((m) => m.id === 'model-b' && m.name === 'Model B')).toBe(true);
      expect(models?.find((m) => m.id === 'model-a')?.modelOptions).toEqual([
        {
          id: 'fast',
          name: 'Fast',
          type: 'select',
          currentValue: 'true',
          options: [
            { value: 'false', name: 'Off' },
            { value: 'true', name: 'Fast' },
          ],
        },
      ]);
    } finally {
      await backend.dispose().catch(() => {});
      await fixture.cleanup();
    }
  }, 20_000);

  it('does not leak unhandled rejections when startSession times out first', async () => {
    let rejectStartSession!: (reason?: unknown) => void;
    const startSessionPromise = new Promise<Awaited<ReturnType<AgentBackend['startSession']>>>((_resolve, reject) => {
      rejectStartSession = reject;
    });
    const backend: ProbeBackendLike = {
      startSession: () => startSessionPromise,
      getSessionModelState: () => null,
      getSessionConfigOptionsState: () => null,
    };

    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      await expect(probeModelsFromAcpBackend({ backend: backend as unknown as AgentBackend, timeoutMs: 1 })).rejects.toThrow(/ACP startSession timeout/i);
      rejectStartSession(new Error('late startSession rejection'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('does not leak unhandled rejections when startSession resolves before timeout', async () => {
    const backend: ProbeBackendLike = {
      startSession: async () =>
        ({ sessionId: 'session-ok' }) as Awaited<ReturnType<AgentBackend['startSession']>>,
      getSessionModelState: () => ({
        availableModels: [{ id: 'model-a', name: 'Model A' }],
      }),
      getSessionConfigOptionsState: () => null,
    };

    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      const models = await probeModelsFromAcpBackend({
        backend: backend as unknown as AgentBackend,
        timeoutMs: 250,
      });
      expect(models).toEqual([
        { id: 'default', name: 'Default' },
        { id: 'model-a', name: 'Model A' },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('clears the startSession timeout timer when startSession resolves first', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const backend: ProbeBackendLike = {
      startSession: async () =>
        ({ sessionId: 'session-ok' }) as Awaited<ReturnType<AgentBackend['startSession']>>,
      getSessionModelState: () => ({
        availableModels: [{ id: 'model-a', name: 'Model A' }],
      }),
      getSessionConfigOptionsState: () => null,
    };

    try {
      const models = await probeModelsFromAcpBackend({
        backend: backend as unknown as AgentBackend,
        timeoutMs: 250,
      });
      expect(models).toEqual([
        { id: 'default', name: 'Default' },
        { id: 'model-a', name: 'Model A' },
      ]);
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});

describe('probeAgentModelsBestEffort', () => {
  it('falls back only to the default Codex model when dynamic probing is unavailable', async () => {
    const prevPath = process.env.PATH;
    const prevOverride = process.env.HAPPIER_CODEX_ACP_BIN;
    process.env.PATH = '';
    delete process.env.HAPPIER_CODEX_ACP_BIN;
    try {
      const res = await probeAgentModelsBestEffort({
        agentId: 'codex',
        cwd: process.cwd(),
        timeoutMs: 500,
      });
      expect(res.source).toBe('static');
      expect(res.availableModels).toEqual([{ id: 'default', name: 'Default' }]);
    } finally {
      process.env.PATH = prevPath;
      if (typeof prevOverride === 'string') {
        process.env.HAPPIER_CODEX_ACP_BIN = prevOverride;
      } else {
        delete process.env.HAPPIER_CODEX_ACP_BIN;
      }
    }
  });
});
