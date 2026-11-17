import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { logger } from '@/ui/logger';
import type { AgentMessage } from '@/agent/core/AgentMessage';
import type { ACPMessageData } from '@/api/session/sessionMessageTypes';
import type { SessionTurnMutationV1 } from '@/api/session/mutations/sessionMutationTypes';
import { createSessionTurnLifecycle } from '@/agent/runtime/session/turn/lifecycle';

import { createTestAcpRuntime as createAcpRuntime } from '@/testkit/backends/acpRuntime';
import { createFakeAcpRuntimeBackend } from '@/testkit/backends/acpRuntimeBackend';
import { createApprovedPermissionHandler } from '@/testkit/backends/permissionHandler';
import { createBasicSessionClientWithOverrides } from '@/testkit/backends/sessionFixtures';
import { AcpPromptSubmissionPhaseError } from '@/agent/acp/AcpBackend';
import { ProviderPromptSubmissionRejectedBeforeEffectError } from '@/agent/runtime/providerPromptSubmission';

function createDeferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('createAcpRuntime (status error surfacing)', () => {
  afterEach(() => {
    delete process.env.HAPPIER_ACP_FAILURE_TRACE;
    vi.restoreAllMocks();
  });

  it('surfaces non-abort status:error as sanitized primary-session failure', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });

    const sent: ACPMessageData[] = [];
    const failedTurns: unknown[] = [];
    const session = {
      ...createBasicSessionClientWithOverrides({
        sendAgentMessage: (_provider, body) => {
          sent.push(body);
        },
      }),
      sessionTurnLifecycle: {
        beginTurn: async () => ({ turnId: 'session-turn-1' }),
        attachProviderTurnId: async () => {},
        appendTranscriptAnchors: async () => {},
        completeTurn: async () => {},
        failTurn: async (record: unknown) => {
          failedTurns.push(record);
        },
        cancelTurn: async () => {},
        endSession: async () => {},
        markRollbackEligible: async () => {},
        markRolledBack: async () => {},
        touchActiveTurn: async () => {},
        hasActiveTurn: () => false,
      },
    };

    const runtime = createAcpRuntime({
      provider: 'gemini',
      directory: '/tmp',
      session,
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();

    backend.emit({ type: 'status', status: 'error', detail: 'Model not found.' } satisfies AgentMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent.some((msg) => msg.type === 'message' && msg.message.includes('Model not found'))).toBe(false);
    await expect.poll(() => sent.some((msg) => msg.type === 'turn_failed')).toBe(true);
    const turnFailed = sent.find((msg) => msg.type === 'turn_failed');
    expect(turnFailed).toEqual(expect.objectContaining({
      type: 'turn_failed',
      issue: expect.objectContaining({
        source: 'provider_status_error',
        sanitizedPreview: 'Provider reported an error',
      }),
    }));
    expect(sent.some((msg) => msg.type === 'turn_aborted')).toBe(false);
    expect(failedTurns).toEqual([
      expect.objectContaining({
        provider: 'gemini',
        issue: expect.objectContaining({
          source: 'provider_status_error',
          sanitizedPreview: 'Provider reported an error',
        }),
      }),
    ]);
    expect(JSON.stringify(failedTurns)).not.toContain('Model not found');
  });

  it('flushes pending permission requests on status:error', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });
    const flushReasons: string[] = [];

    const runtime = createAcpRuntime({
      provider: 'gemini',
      directory: '/tmp',
      session: createBasicSessionClientWithOverrides(),
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: {
        ...createApprovedPermissionHandler(),
        abortPendingRequestsAndFlush: async (reason: string) => {
          flushReasons.push(reason);
        },
      },
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();

    backend.emit({ type: 'status', status: 'error', detail: 'Model not found.' } satisfies AgentMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(flushReasons).toEqual(['ACP runtime status:error']);
  });







  it('does not surface abort-like status:error detail as a transcript message', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });

    const sent: ACPMessageData[] = [];
    const session = createBasicSessionClientWithOverrides({
      sendAgentMessage: (_provider, body) => {
        sent.push(body);
      },
    });

    const runtime = createAcpRuntime({
      provider: 'opencode',
      directory: '/tmp',
      session,
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();

    backend.emit({
      type: 'status',
      status: 'error',
      detail: 'Error: OpenCode session aborted\n    at Object.cancel (/tmp/runtime.ts:10:1)',
    } satisfies AgentMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent.some((msg) => msg.type === 'message' && msg.message.includes('OpenCode session aborted'))).toBe(false);
    expect(sent.some((msg) => msg.type === 'message' && msg.message.includes('at Object.cancel'))).toBe(false);
    await expect.poll(() => sent.some((msg) => msg.type === 'turn_aborted')).toBe(true);
  });

  it('opens and fails a lifecycle turn when status:error arrives before task_started', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });
    const mutations: SessionTurnMutationV1[] = [];
    const sessionTurnLifecycle = createSessionTurnLifecycle({
      sessionId: 'happy-session-1',
      createId: () => 'turn-1',
      now: () => 123,
      enqueueSessionTurn: async (mutation) => {
        mutations.push(mutation);
      },
    });

    const runtime = createAcpRuntime({
      provider: 'gemini',
      directory: '/tmp',
      session: {
        ...createBasicSessionClientWithOverrides(),
        sessionTurnLifecycle,
      },
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();

    backend.emit({ type: 'status', status: 'error', detail: 'Model not found.' } satisfies AgentMessage);
    await Promise.resolve();
    await Promise.resolve();

    await expect.poll(() => mutations).toEqual([
      expect.objectContaining({
        action: 'begin',
        turnId: 'session-turn:turn-1',
        provider: 'gemini',
      }),
      expect.objectContaining({
        action: 'fail',
        turnId: 'session-turn:turn-1',
        provider: 'gemini',
        issue: expect.objectContaining({
          source: 'provider_status_error',
        }),
      }),
    ]);
  });

  it('terminalizes the failed turn before a delayed transcript flush can admit the next turn', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });
    const mutations: SessionTurnMutationV1[] = [];
    const committed: ACPMessageData[] = [];
    const delayedAssistantCommit = createDeferred();
    let nextTurnId = 0;
    const sessionTurnLifecycle = createSessionTurnLifecycle({
      sessionId: 'happy-session-1',
      createId: () => `turn-${++nextTurnId}`,
      now: () => 123,
      enqueueSessionTurn: async (mutation) => {
        mutations.push(mutation);
      },
    });
    const session = createBasicSessionClientWithOverrides({
      sendAgentMessage: (provider, body) => {
        const observed = sessionTurnLifecycle.observeAcpLifecycleMarker({ provider, body });
        void observed.pendingWrite;
      },
      sendAgentMessageCommitted: async (_provider, body) => {
        committed.push(body);
        if (body.type === 'message' && body.message === 'turn one output') {
          await delayedAssistantCommit.promise;
        }
      },
    });

    const runtime = createAcpRuntime({
      provider: 'gemini',
      directory: '/tmp',
      session: { ...session, sessionTurnLifecycle },
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    backend.emit({ type: 'model-output', textDelta: 'turn one output' } satisfies AgentMessage);
    backend.emit({ type: 'status', status: 'error', detail: 'Provider failed.' } satisfies AgentMessage);
    await expect.poll(() => committed.some((body) => body.type === 'message')).toBe(true);

    await runtime.flushTurn();
    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    delayedAssistantCommit.resolve();

    await expect.poll(() => mutations.map((mutation) => mutation.action)).toEqual([
      'begin',
      'fail',
      'begin',
    ]);
    expect(mutations[0]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[1]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[2]?.turnId).toBe('session-turn:turn-2');
    expect(sessionTurnLifecycle.getActiveTurnId()).toBe('session-turn:turn-2');
    await expect.poll(() => committed.find((body) => body.type === 'turn_failed')).toEqual(expect.objectContaining({
      type: 'turn_failed',
      id: mutations[0]?.providerTurnId,
    }));
  });

  it('terminalizes an aborted turn before a delayed transcript flush can admit the next turn', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });
    const mutations: SessionTurnMutationV1[] = [];
    const committed: ACPMessageData[] = [];
    const delayedAssistantCommit = createDeferred();
    let nextTurnId = 0;
    const sessionTurnLifecycle = createSessionTurnLifecycle({
      sessionId: 'happy-session-1',
      createId: () => `turn-${++nextTurnId}`,
      now: () => 123,
      enqueueSessionTurn: async (mutation) => {
        mutations.push(mutation);
      },
    });
    const session = createBasicSessionClientWithOverrides({
      sendAgentMessage: (provider, body) => {
        const observed = sessionTurnLifecycle.observeAcpLifecycleMarker({ provider, body });
        void observed.pendingWrite;
      },
      sendAgentMessageCommitted: async (_provider, body) => {
        committed.push(body);
        if (body.type === 'message' && body.message === 'turn one output') {
          await delayedAssistantCommit.promise;
        }
      },
    });

    const runtime = createAcpRuntime({
      provider: 'opencode',
      directory: '/tmp',
      session: { ...session, sessionTurnLifecycle },
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    backend.emit({ type: 'model-output', textDelta: 'turn one output' } satisfies AgentMessage);
    backend.emit({
      type: 'status',
      status: 'error',
      detail: 'Error: OpenCode session aborted\n    at Object.cancel (/tmp/runtime.ts:10:1)',
    } satisfies AgentMessage);
    await expect.poll(() => committed.some((body) => body.type === 'message')).toBe(true);

    await runtime.flushTurn();
    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    delayedAssistantCommit.resolve();

    await expect.poll(() => mutations.map((mutation) => mutation.action)).toEqual([
      'begin',
      'cancel',
      'begin',
    ]);
    expect(mutations[0]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[1]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[2]?.turnId).toBe('session-turn:turn-2');
    expect(sessionTurnLifecycle.getActiveTurnId()).toBe('session-turn:turn-2');
    await expect.poll(() => committed.find((body) => body.type === 'turn_aborted')).toEqual({
      type: 'turn_aborted',
      id: mutations[0]?.providerTurnId,
    });
  });

  it('terminalizes a prompt failure before a delayed transcript flush can admit the next turn', async () => {
    const backend = createFakeAcpRuntimeBackend({ sessionId: 'sess_main' });
    const mutations: SessionTurnMutationV1[] = [];
    const committed: ACPMessageData[] = [];
    const delayedAssistantCommit = createDeferred();
    let nextTurnId = 0;
    const sessionTurnLifecycle = createSessionTurnLifecycle({
      sessionId: 'happy-session-1',
      createId: () => `turn-${++nextTurnId}`,
      now: () => 123,
      enqueueSessionTurn: async (mutation) => {
        mutations.push(mutation);
      },
    });
    const session = createBasicSessionClientWithOverrides({
      sendAgentMessage: (provider, body) => {
        const observed = sessionTurnLifecycle.observeAcpLifecycleMarker({ provider, body });
        void observed.pendingWrite;
      },
      sendAgentMessageCommitted: async (_provider, body) => {
        committed.push(body);
        if (body.type === 'message' && body.message === 'turn one output') {
          await delayedAssistantCommit.promise;
        }
      },
    });

    const runtime = createAcpRuntime({
      provider: 'gemini',
      directory: '/tmp',
      session: { ...session, sessionTurnLifecycle },
      messageBuffer: new MessageBuffer(),
      mcpServers: {},
      permissionHandler: createApprovedPermissionHandler(),
      onThinkingChange: () => {},
      ensureBackend: async () => backend,
    });

    await runtime.startOrLoad({});
    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    backend.emit({ type: 'model-output', textDelta: 'turn one output' } satisfies AgentMessage);
    const failure = runtime.failTurn(new Error('Provider session failed'));
    await expect.poll(() => committed.some((body) => body.type === 'message')).toBe(true);

    runtime.beginTurn();
    backend.emit({ type: 'status', status: 'running' } satisfies AgentMessage);
    delayedAssistantCommit.resolve();
    await failure;

    expect(mutations.map((mutation) => mutation.action)).toEqual([
      'begin',
      'fail',
      'begin',
    ]);
    expect(mutations[0]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[1]?.turnId).toBe('session-turn:turn-1');
    expect(mutations[2]?.turnId).toBe('session-turn:turn-2');
    expect(sessionTurnLifecycle.getActiveTurnId()).toBe('session-turn:turn-2');
    expect(committed).toContainEqual(expect.objectContaining({
      type: 'turn_failed',
      id: mutations[0]?.providerTurnId,
    }));
  });
});
