import { describe, expect, it } from 'vitest';
import { renderHook } from '@/dev/testkit';
import { useProviderAuthenticationState } from './useProviderAuthenticationState';
import type { CLIAvailability } from '@/hooks/auth/useCLIDetection';
import type { ProviderLocalAuthPlugin } from '@/agents/providers/shared/providerLocalAuthPlugin';

describe('useProviderAuthenticationState', () => {
    it('passes resolvedCommand to buildAuthLaunches when available', async () => {
        const buildAuthLaunchesMock = ({ resolvedPath, resolvedCommand }: { resolvedPath?: string | null; resolvedCommand?: string | null }) => [{
            kind: 'primary' as const,
            initialCommand: resolvedCommand ?? (resolvedPath ? `${resolvedPath} login` : 'codex login'),
        }];

        const authPlugin: ProviderLocalAuthPlugin = {
            providerId: 'codex',
            support: 'login_terminal',
            buildAuthLaunches: buildAuthLaunchesMock,
            docsUrl: undefined,
            statusHelpText: undefined,
        };

        const cliAvailability: CLIAvailability = {
            available: { codex: true } as any,
            login: { codex: null } as any,
            authStatus: { codex: null } as any,
            resolvedPath: { codex: '/opt/codex/bin/codex' } as any,
            resolvedCommand: { codex: `'/opt/codex/bin/codex'` } as any,
            resolutionSource: { codex: 'system' } as any,
            tmux: null,
            isDetecting: false,
            timestamp: 123,
            refresh: () => {},
        };

        const primaryMachine = {
            id: 'm1',
            metadata: { homeDir: '/home/user' },
        };

        const hook = await renderHook(() =>
            useProviderAuthenticationState({
                providerId: 'codex' as any,
                cliAvailability,
                authPlugin,
                primaryMachine,
            })
        );

        expect(hook.getCurrent().authLaunches[0]?.initialCommand).toBe(`'/opt/codex/bin/codex'`);
    });

    it('passes null resolvedPath when CLI is not available', async () => {
        const buildAuthLaunchesMock = ({ resolvedPath }: { resolvedPath?: string | null }) => [{
            kind: 'primary' as const,
            initialCommand: resolvedPath ? `${resolvedPath} login` : 'codex login',
        }];

        const authPlugin: ProviderLocalAuthPlugin = {
            providerId: 'codex',
            support: 'login_terminal',
            buildAuthLaunches: buildAuthLaunchesMock,
            docsUrl: undefined,
            statusHelpText: undefined,
        };

        const cliAvailability: CLIAvailability = {
            available: { codex: false } as any,
            login: { codex: null } as any,
            authStatus: { codex: null } as any,
            resolvedPath: { codex: null } as any,
            resolvedCommand: { codex: null } as any,
            resolutionSource: { codex: null } as any,
            tmux: null,
            isDetecting: false,
            timestamp: 123,
            refresh: () => {},
        };

        const primaryMachine = {
            id: 'm1',
            metadata: { homeDir: '/home/user' },
        };

        const hook = await renderHook(() =>
            useProviderAuthenticationState({
                providerId: 'codex' as any,
                cliAvailability,
                authPlugin,
                primaryMachine,
            })
        );

        expect(hook.getCurrent().authLaunches[0]?.initialCommand).toBe('codex login');
    });

    it('allows launching the login terminal when the machine home directory is unavailable', async () => {
        const authPlugin: ProviderLocalAuthPlugin = {
            providerId: 'codex',
            support: 'login_terminal',
            buildAuthLaunches: () => [{ kind: 'primary', initialCommand: 'codex login' }],
            docsUrl: undefined,
            statusHelpText: undefined,
        };

        const cliAvailability: CLIAvailability = {
            available: { codex: true } as any,
            login: { codex: null } as any,
            authStatus: { codex: null } as any,
            resolvedPath: { codex: '/opt/codex/bin/codex' } as any,
            resolvedCommand: { codex: `'/opt/codex/bin/codex'` } as any,
            resolutionSource: { codex: 'system' } as any,
            tmux: null,
            isDetecting: false,
            timestamp: 123,
            refresh: () => {},
        };

        const primaryMachine = {
            id: 'm1',
            metadata: {},
        };

        const hook = await renderHook(() =>
            useProviderAuthenticationState({
                providerId: 'codex' as any,
                cliAvailability,
                authPlugin,
                primaryMachine,
            })
        );

        expect(hook.getCurrent().canLaunchAuth).toBe(true);
        expect(hook.getCurrent().machineHomeDir).toBe(null);
    });

    it('preserves ordered primary and device-code actions from the provider contribution', async () => {
        const authPlugin: ProviderLocalAuthPlugin = {
            providerId: 'codex',
            support: 'login_terminal',
            buildAuthLaunches: () => [
                { kind: 'primary', initialCommand: 'codex login' },
                { kind: 'device_code', initialCommand: 'codex login --device-auth' },
            ],
        };
        const cliAvailability: CLIAvailability = {
            available: { codex: true } as never,
            login: { codex: null } as never,
            authStatus: { codex: null } as never,
            resolvedPath: { codex: '/opt/codex' } as never,
            resolvedCommand: { codex: '/opt/codex' } as never,
            resolutionSource: { codex: 'system' } as never,
            tmux: null,
            isDetecting: false,
            timestamp: 123,
            refresh: () => {},
        };

        const hook = await renderHook(() => useProviderAuthenticationState({
            providerId: 'codex',
            cliAvailability,
            authPlugin,
            primaryMachine: { id: 'm1', metadata: { homeDir: '/home/user' } },
        }));

        expect(hook.getCurrent().authLaunches.map((launch) => launch.kind)).toEqual(['primary', 'device_code']);
        expect(hook.getCurrent().canLaunchAuth).toBe(true);
    });
});
