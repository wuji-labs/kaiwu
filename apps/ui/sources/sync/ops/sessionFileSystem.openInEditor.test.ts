import { describe, expect, it, vi } from 'vitest';
import { RPC_ERROR_CODES, RPC_METHODS } from '@happier-dev/protocol/rpc';
import type { FeaturesResponse } from '@happier-dev/protocol';
import { createStorageModuleStub } from '@/dev/testkit/mocks/storage';

type OpenInEditorRpcResponse =
    | Readonly<{ success: true; targetPath: string; editorUsed: string }>
    | Readonly<{ success: false; error: string }>
    | null;

let policyConsulted = false;

const sessionRPCSpy = vi.fn(
    async (_sessionId: string, _method: string, _payload: unknown): Promise<OpenInEditorRpcResponse> => ({
        success: true,
        targetPath: 'src/index.ts',
        editorUsed: 'code',
    }),
);

const machineRPCSpy = vi.fn(
    async (_machineId: string, _method: string, _payload: unknown): Promise<OpenInEditorRpcResponse> => ({
        success: true,
        targetPath: 'src/index.ts',
        editorUsed: 'code',
    }),
);

const getStateSpy = vi.fn();
const getReadyServerFeaturesSpy = vi.fn(async (_params: unknown): Promise<FeaturesResponse | null> => {
    policyConsulted = true;
    return {
        features: {
            machines: {
                enabled: true,
                transfer: {
                    enabled: true,
                    serverRouted: {
                        enabled: true,
                    },
                },
            },
        },
        capabilities: {},
    } as FeaturesResponse;
});

const sessionRpcWithServerScopeSpy = vi.fn(
    async (params: unknown): Promise<OpenInEditorRpcResponse> => {
        const { sessionId, method, payload } = params as { sessionId: string; method: string; payload: unknown };
        return sessionRPCSpy(sessionId, method, payload);
    },
);

vi.mock('../api/session/apiSocket', () => ({
    apiSocket: {
        sessionRPC: (sessionId: string, method: string, payload: any) => sessionRPCSpy(sessionId, method, payload),
        machineRPC: (machineId: string, method: string, payload: any) => machineRPCSpy(machineId, method, payload),
    },
}));

vi.mock('../api/capabilities/getReadyServerFeatures', () => ({
    getReadyServerFeatures: (params: unknown) => getReadyServerFeaturesSpy(params),
}));

vi.mock('../runtime/orchestration/serverScopedRpc/serverScopedSessionRpc', () => ({
    sessionRpcWithServerScope: (params: unknown) => sessionRpcWithServerScopeSpy(params),
}));

vi.mock('../runtime/orchestration/serverScopedRpc/resolvePreferredServerIdForSessionId', () => ({
    resolvePreferredServerIdForSessionId: () => 'server-1',
}));

vi.mock('../domains/state/storage', () => ({
    ...createStorageModuleStub({
        storage: Object.assign(
            ((selector?: (value: ReturnType<typeof getStateSpy>) => unknown) => {
                const snapshot = getStateSpy();
                return typeof selector === 'function' ? selector(snapshot) : snapshot;
            }),
            {
                getState: () => getStateSpy(),
                getInitialState: () => getStateSpy(),
                setState: () => undefined,
                subscribe: () => () => undefined,
                destroy: () => undefined,
            },
        ),
    }),
}));

function setActiveSessionMachineState() {
    getStateSpy.mockReturnValue({
        sessions: {
            s1: {
                active: true,
                metadata: {
                    path: '~/repo',
                    machineId: 'm1',
                },
            },
        },
        machines: {
            m1: {
                id: 'm1',
                active: true,
                metadata: {},
            },
        },
    });
}

describe('sessionOpenInEditor', () => {
    it('dispatches openInEditor RPC to machine target and rebase path', async () => {
        const { sessionOpenInEditor } = await import('./sessionFileSystem');

        policyConsulted = false;
        setActiveSessionMachineState();

        sessionRPCSpy.mockClear();
        machineRPCSpy.mockClear();
        getReadyServerFeaturesSpy.mockClear();

        const res = await sessionOpenInEditor('s1', {
            path: 'src/a.ts',
            line: 42,
            column: 10,
            editor: 'code',
        });

        expect(res).toMatchObject({ success: true, targetPath: 'src/index.ts', editorUsed: 'code' });
        expect(getReadyServerFeaturesSpy).toHaveBeenCalledTimes(1);
        expect(machineRPCSpy).toHaveBeenCalledWith('m1', RPC_METHODS.OPEN_IN_EDITOR, {
            path: '~/repo/src/a.ts',
            line: 42,
            column: 10,
            editor: 'code',
        });
        expect(sessionRPCSpy).not.toHaveBeenCalled();
    });
});
