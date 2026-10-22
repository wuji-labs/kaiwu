import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-task-manager / expo-background-task / expo-notifications are the OS boundary: the tests
// capture what the module hands the OS and invoke it the way the OS would.
const taskManager = vi.hoisted(() => ({ tasks: new Map<string, (body: { data: unknown }) => Promise<unknown>>() }));
vi.mock('expo-task-manager', () => ({
    defineTask: (name: string, task: (body: { data: unknown }) => Promise<unknown>) => {
        taskManager.tasks.set(name, task);
    },
}));
vi.mock('expo-background-task', () => ({
    BackgroundTaskResult: { Success: 1, Failed: 2 },
    BackgroundTaskStatus: { Restricted: 1, Available: 2 },
    getStatusAsync: vi.fn(async () => 2),
    registerTaskAsync: vi.fn(async () => undefined),
}));
vi.mock('expo-notifications', () => ({
    registerTaskAsync: vi.fn(async () => undefined),
}));
vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({ Platform: { OS: 'ios' } });
});

import {
    BACKGROUND_PUSH_SESSION_REFRESH_TASK,
    BACKGROUND_REFRESH_BUDGET_MS,
    BACKGROUND_SESSION_REFRESH_TASK,
    defineBackgroundSessionRefreshTasks,
    readPushWakeTarget,
    runBackgroundSessionRefresh,
    type BackgroundRefreshDependencies,
} from './backgroundSessionRefresh';
import { getActiveServerSnapshot } from '@/sync/domains/server/serverRuntime';

/**
 * Payload shapes are the ones `expo-notifications` 0.32 emits, taken from its own
 * `BackgroundEventTransformerSpec.swift` (iOS) and `RemoteMessageSerializer.java` (Android): the
 * Expo push `data` arrives as the JSON string `data.dataString` on both platforms.
 */
function iosBackgroundPayload(body: Record<string, unknown>) {
    return {
        notification: { title: 'Ready', body: 'Session finished' },
        aps: { alert: { title: 'Ready' }, 'content-available': 1 },
        data: {
            body,
            dataString: JSON.stringify(body),
            scopeKey: '@wujilabs/kaiwu',
            experienceId: '@wujilabs/kaiwu',
        },
    };
}

function androidBackgroundPayload(body: Record<string, unknown>) {
    return { notification: null, data: { dataString: JSON.stringify(body), title: 'Ready', message: 'Session finished' } };
}

function createDeps(overrides?: Partial<BackgroundRefreshDependencies>) {
    const calls: Array<{ sessionIds?: readonly string[]; deadlineAtMs: number }> = [];
    const deps: BackgroundRefreshDependencies = {
        ensureSyncReady: async () => true,
        refreshSessionsInBackground: async (params) => {
            calls.push(params);
            return { kind: 'refreshed', sessions: params.sessionIds?.length ?? 3, newMessages: 2 };
        },
        now: () => 1_000,
        ...overrides,
    };
    return { deps, calls };
}

describe('background session refresh', () => {
    beforeEach(() => {
        taskManager.tasks.clear();
    });

    it('reads the woken session from both platforms\' background payloads and ignores taps and other servers', () => {
        const active = 'https://kaiwu.example.test';
        const body = { sessionId: 's-1', serverUrl: active, type: 'ready' };

        expect(readPushWakeTarget(iosBackgroundPayload(body), active)).toEqual({ sessionId: 's-1' });
        expect(readPushWakeTarget(androidBackgroundPayload(body), `${active}/`)).toEqual({ sessionId: 's-1' });
        expect(readPushWakeTarget(iosBackgroundPayload({ ...body, serverUrl: 'https://other.example.test' }), active)).toBeNull();
        expect(readPushWakeTarget({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: {} }, active)).toBeNull();
        // A wake without a session still refreshes the recent set.
        expect(readPushWakeTarget(androidBackgroundPayload({ serverUrl: active }), active)).toEqual({ sessionId: null });
    });

    it('refreshes within the OS budget and reports whether anything new arrived', async () => {
        const { deps, calls } = createDeps();

        await expect(runBackgroundSessionRefresh(deps, { trigger: 'push', sessionIds: ['s-1'] })).resolves.toBe('new-data');
        expect(calls).toEqual([{ sessionIds: ['s-1'], deadlineAtMs: 1_000 + BACKGROUND_REFRESH_BUDGET_MS }]);

        const signedOut = createDeps({ ensureSyncReady: async () => false });
        await expect(runBackgroundSessionRefresh(signedOut.deps, { trigger: 'periodic' })).resolves.toBe('no-data');
        expect(signedOut.calls).toEqual([]);

        const failing = createDeps({ refreshSessionsInBackground: async () => { throw new Error('offline'); } });
        await expect(runBackgroundSessionRefresh(failing.deps, { trigger: 'periodic' })).resolves.toBe('failed');
    });

    it('wires the push task to refresh exactly the woken session and the periodic task to the recent set', async () => {
        const { deps, calls } = createDeps();
        defineBackgroundSessionRefreshTasks(() => deps);
        const pushTask = taskManager.tasks.get(BACKGROUND_PUSH_SESSION_REFRESH_TASK);
        const periodicTask = taskManager.tasks.get(BACKGROUND_SESSION_REFRESH_TASK);
        if (!pushTask || !periodicTask) throw new Error('expected both tasks to be defined');
        const active = getActiveServerSnapshot().serverUrl;

        // 2 = NewData: the OS is told the wake fetched content.
        await expect(pushTask({ data: iosBackgroundPayload({ sessionId: 's-9', serverUrl: active }) })).resolves.toBe(2);
        await expect(periodicTask({ data: null })).resolves.toBe(1);

        expect(calls.map((call) => call.sessionIds)).toEqual([['s-9'], undefined]);
    });
});
