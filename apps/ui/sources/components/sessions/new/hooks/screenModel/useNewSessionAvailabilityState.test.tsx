import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';

import { renderHook } from '@/dev/testkit/hooks/renderHook';
import type { Machine } from '@/sync/domains/state/storageTypes';
import { installNewSessionScreenModelCommonModuleMocks } from '../newSessionScreenModelTestHelpers';

installNewSessionScreenModelCommonModuleMocks({
    text: async () => {
        const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
        return createTextModuleMock({
            translate: (key: string) => key,
        });
    },
});

const cliRefreshA = vi.fn();
const cliRefreshB = vi.fn();
let cliRefreshCurrent = cliRefreshA;
let cliDetectionTimestamp = 123;
const useCLIDetectionMock = vi.fn();

vi.mock('@/hooks/auth/useCLIDetection', () => ({
    useCLIDetection: (...args: unknown[]) => {
        useCLIDetectionMock(...args);
        return {
            available: { claude: false, codex: true },
            login: {},
            authStatus: {},
            resolvedPath: {},
            resolvedCommand: {},
            resolutionSource: {},
            tmux: null,
            isDetecting: false,
            timestamp: cliDetectionTimestamp,
            refresh: cliRefreshCurrent,
        };
    },
}));

const capabilitiesRefreshA = vi.fn();
const capabilitiesRefreshB = vi.fn();
let capabilitiesRefreshCurrent = capabilitiesRefreshA;
let capabilitiesStateCurrent: Record<string, unknown> = { status: 'idle' };

vi.mock('@/hooks/server/useDaemonScopedMachineCapabilitiesCache', () => ({
    useDaemonScopedMachineCapabilitiesCache: () => ({
        state: capabilitiesStateCurrent,
        refresh: capabilitiesRefreshCurrent,
    }),
}));

vi.mock('@/components/sessions/new/modules/newSessionAgentSelection', () => ({
    isAgentSelectableForNewSession: ({ agentId, availabilityById }: any) => availabilityById?.[agentId] !== false,
    resolveProfileAvailabilityForNewSession: () => ({ available: true }),
}));

vi.mock('@/utils/timing/runAfterInteractionsWithFallback', () => ({
    runAfterInteractionsWithFallback: (fn: () => void) => {
        fn();
        return undefined;
    },
}));

describe('useNewSessionAvailabilityState', () => {
    beforeEach(() => {
        cliRefreshA.mockClear();
        cliRefreshB.mockClear();
        useCLIDetectionMock.mockClear();
        capabilitiesRefreshA.mockClear();
        capabilitiesRefreshB.mockClear();
        cliRefreshCurrent = cliRefreshA;
        cliDetectionTimestamp = 123;
        capabilitiesRefreshCurrent = capabilitiesRefreshA;
        capabilitiesStateCurrent = { status: 'idle' };
    });

    it('keeps selection callbacks stable when CLI detection stays ready', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');
        const settings = {};
        const enabledAgentIds = ['claude', 'codex'] as any;
        const agentNewSessionOptionStateByAgentId = {};
        const resolvedBackendEntries: any[] = [];
        const machines: Machine[] = [];
        const setBackendTarget = vi.fn();
        const setDismissedCliWarnings = vi.fn();
        const allProfiles: any[] = [];

        const hook = await renderHook((props: { salt: number }) => useNewSessionAvailabilityState({
            selectedMachineId: null,
            selectedMachine: null,
            capabilityServerId: 'server-1',
            settings: settings as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds,
            agentNewSessionOptionStateByAgentId,
            resolvedBackendEntries,
            selectedBackendEntry: null,
            setBackendTarget,
            machines,
            dismissedCliWarnings: null,
            setDismissedCliWarnings,
            allProfiles,
        }), { initialProps: { salt: 0 } });
        const firstIsAgentSelectable = hook.getCurrent().isAgentSelectable;
        const firstIsBackendEntrySelectable = hook.getCurrent().isBackendEntrySelectable;

        cliDetectionTimestamp = 456;
        await hook.rerender({ salt: 1 });

        expect(hook.getCurrent().isAgentSelectable).toBe(firstIsAgentSelectable);
        expect(hook.getCurrent().isBackendEntrySelectable).toBe(firstIsBackendEntrySelectable);
    });

    it('does not auto-switch the selected backend when CLI detection marks it unavailable', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const setBackendTarget = vi.fn();

        await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: null,
            selectedMachine: null,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [
                {
                    family: 'builtInAgent',
                    builtInAgentId: 'claude',
                    target: { kind: 'builtInAgent', agentId: 'claude' },
                    targetKey: 'agent:claude',
                    title: 'Claude',
                } as any,
                {
                    family: 'builtInAgent',
                    builtInAgentId: 'codex',
                    target: { kind: 'builtInAgent', agentId: 'codex' },
                    targetKey: 'agent:codex',
                    title: 'Codex',
                } as any,
            ],
            selectedBackendEntry: {
                family: 'builtInAgent',
                builtInAgentId: 'claude',
                target: { kind: 'builtInAgent', agentId: 'claude' },
                targetKey: 'agent:claude',
                title: 'Claude',
            } as any,
            setBackendTarget,
            machines: [],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(setBackendTarget).not.toHaveBeenCalled();
    });

    it('requests CLI login-status probes for the enabled agents on the selected server', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: 'machine-1',
            selectedMachine: null,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(useCLIDetectionMock).toHaveBeenCalledWith('machine-1', {
            autoDetect: false,
            includeLoginStatus: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
            serverId: 'server-1',
        });
    });

    it('filters manual-only providers out of automatic login-status probes', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: 'machine-1',
            selectedMachine: null,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'customAcp'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(useCLIDetectionMock).toHaveBeenCalledWith('machine-1', {
            autoDetect: false,
            includeLoginStatus: true,
            includeLoginStatusForAgentIds: ['claude'],
            serverId: 'server-1',
        });
    });

    it('disables automatic login-status probes when no enabled agent supports background auth checks', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: 'machine-1',
            selectedMachine: null,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'customAcp' as any,
            resumeSessionId: null,
            enabledAgentIds: ['customAcp'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(useCLIDetectionMock).toHaveBeenCalledWith('machine-1', {
            autoDetect: false,
            includeLoginStatus: false,
            includeLoginStatusForAgentIds: [],
            serverId: 'server-1',
        });
    });

    it('does not re-run the initial probe refresh when refresh callback identities churn', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const setBackendTarget = vi.fn();
        const machine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hook = await renderHook((props: { refreshSalt: number }) => useNewSessionAvailabilityState({
            selectedMachineId: 'm1',
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget,
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }), { initialProps: { refreshSalt: 0 } });

        expect(cliRefreshA).toHaveBeenCalledTimes(1);
        expect(cliRefreshA.mock.calls[0]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
        });
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(1);

        cliRefreshCurrent = cliRefreshB;
        capabilitiesRefreshCurrent = capabilitiesRefreshB;
        await hook.rerender({ refreshSalt: 1 });

        expect(cliRefreshA).toHaveBeenCalledTimes(1);
        expect(cliRefreshA.mock.calls[0]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
        });
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(1);
        expect(cliRefreshB).toHaveBeenCalledTimes(0);
        expect(capabilitiesRefreshB).toHaveBeenCalledTimes(0);
    });

    it('re-runs the initial probe refresh when the machine transitions offline → online', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const baseMachine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: false,
            // Ensure offline even with online-grace logic (activeAt must be old + active=false)
            activeAt: 1,
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hook = await renderHook((props: { machine: Machine }) => useNewSessionAvailabilityState({
            selectedMachineId: props.machine.id,
            selectedMachine: props.machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [props.machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }), { initialProps: { machine: baseMachine } });

        expect(cliRefreshA).toHaveBeenCalledTimes(0);
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(0);

        await hook.rerender({ machine: { ...baseMachine, active: true, activeAt: Date.now() } });
        expect(cliRefreshA).toHaveBeenCalledTimes(1);
        expect(cliRefreshA.mock.calls[0]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
        });
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(1);

        await hook.rerender({ machine: { ...baseMachine, active: false } });
        await hook.rerender({ machine: { ...baseMachine, active: true, activeAt: Date.now() } });
        expect(cliRefreshA).toHaveBeenCalledTimes(2);
        expect(cliRefreshA.mock.calls[1]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
        });
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(2);
    });

    it('reports probing spawn readiness while exact daemon capabilities are loading', async () => {
        vi.resetModules();
        capabilitiesStateCurrent = { status: 'loading' };

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');
        const machine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hook = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: 'm1',
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(hook.getCurrent().selectedMachineSpawnReadiness).toEqual({
            status: 'probing',
            machineId: 'm1',
        });
    });

    it('reports ready spawn readiness only when exact daemon capabilities are loaded', async () => {
        vi.resetModules();
        capabilitiesStateCurrent = {
            status: 'loaded',
            snapshot: {
                response: {
                    results: {},
                },
            },
        };

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');
        const machine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hook = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: 'm1',
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }));

        expect(hook.getCurrent().selectedMachineSpawnReadiness).toEqual({
            status: 'ready',
            machineId: 'm1',
        });
    });

    it('re-runs the initial probe refresh when the enabled agent set changes', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const machine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hook = await renderHook((props: { enabledAgentIds: readonly string[] }) => useNewSessionAvailabilityState({
            selectedMachineId: 'm1',
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: props.enabledAgentIds as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings: vi.fn(),
            allProfiles: [],
        }), { initialProps: { enabledAgentIds: ['claude'] } });

        expect(cliRefreshA).toHaveBeenCalledTimes(1);
        expect(cliRefreshA.mock.calls[0]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude'],
        });

        await hook.rerender({ enabledAgentIds: ['claude', 'codex'] });

        expect(cliRefreshA).toHaveBeenCalledTimes(2);
        expect(cliRefreshA.mock.calls[1]?.[0]).toEqual({
            bypassCache: true,
            includeLoginStatusForAgentIds: ['claude', 'codex'],
        });
        expect(capabilitiesRefreshA).toHaveBeenCalledTimes(2);
    });

    it('keeps temporary CLI banner dismissals across hook remounts (same app session)', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const setDismissedCliWarnings = vi.fn();
        const machine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hookA = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: machine.id,
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings,
            allProfiles: [],
        }));

        expect(hookA.getCurrent().isCliBannerDismissed('claude' as any)).toBe(false);

        await act(async () => {
            hookA.getCurrent().dismissCliBanner('claude' as any, 'temporary');
        });
        await hookA.rerender();

        expect(hookA.getCurrent().isCliBannerDismissed('claude' as any)).toBe(true);
        expect(setDismissedCliWarnings).not.toHaveBeenCalled();

        await hookA.unmount();

        const hookB = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: machine.id,
            selectedMachine: machine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [machine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings,
            allProfiles: [],
        }));

        expect(hookB.getCurrent().isCliBannerDismissed('claude' as any)).toBe(true);
    });

    it('treats temporary CLI banner dismissals as machine-scoped', async () => {
        vi.resetModules();

        const { useNewSessionAvailabilityState } = await import('./useNewSessionAvailabilityState');

        const setDismissedCliWarnings = vi.fn();
        const baseMachine: Machine = {
            id: 'm1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: Date.now(),
            revokedAt: null,
            metadata: null,
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
        };

        const hookA = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: baseMachine.id,
            selectedMachine: baseMachine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [baseMachine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings,
            allProfiles: [],
        }));

        await act(async () => {
            hookA.getCurrent().dismissCliBanner('claude' as any, 'temporary');
        });
        await hookA.rerender();

        expect(hookA.getCurrent().isCliBannerDismissed('claude' as any)).toBe(true);
        await hookA.unmount();

        const otherMachine: Machine = { ...baseMachine, id: 'm2' };
        const hookB = await renderHook(() => useNewSessionAvailabilityState({
            selectedMachineId: otherMachine.id,
            selectedMachine: otherMachine,
            capabilityServerId: 'server-1',
            settings: {} as any,
            agentType: 'claude' as any,
            resumeSessionId: null,
            enabledAgentIds: ['claude', 'codex'] as any,
            agentNewSessionOptionStateByAgentId: {},
            resolvedBackendEntries: [],
            selectedBackendEntry: null,
            setBackendTarget: vi.fn(),
            machines: [otherMachine],
            dismissedCliWarnings: null,
            setDismissedCliWarnings,
            allProfiles: [],
        }));

        expect(hookB.getCurrent().isCliBannerDismissed('claude' as any)).toBe(false);
    });
});
