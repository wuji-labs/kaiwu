import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { getActiveServerSnapshot } from '@/sync/domains/server/serverRuntime';
import { syncPerformanceTelemetry } from '@/sync/runtime/syncPerformanceTelemetry';
import { syncReliabilityTelemetry } from '@/sync/runtime/syncReliabilityTelemetry';

/**
 * Background session refresh: keeps the durable transcript cache current while the app is not in
 * the foreground, so opening the app paints sessions that are already fresh.
 *
 * Two OS entry points, one body:
 * - **Periodic** — `expo-background-task` (iOS BGTaskScheduler processing task, Android
 *   WorkManager). The OS decides when; 15 minutes is the floor both platforms accept.
 * - **Push wake** — every activity push carries iOS `content-available` (the CLI sets it), and on
 *   Android every Expo push is an FCM data message, so `expo-notifications` runs this task with the
 *   push's data. The push's visible alert is unchanged; nothing here presents a notification.
 *
 * Both tasks must be defined at module scope before the app root renders, because the OS may start
 * the JS runtime only to run them; `index.ts` imports this module first.
 */

export const BACKGROUND_SESSION_REFRESH_TASK = 'kaiwu.session-refresh.periodic.v1';
export const BACKGROUND_PUSH_SESSION_REFRESH_TASK = 'kaiwu.session-refresh.push.v1';

const PERIODIC_MINIMUM_INTERVAL_MINUTES = 15;

/**
 * The value a background notification task returns, mapped by `expo-notifications` to the iOS
 * `UIBackgroundFetchResult` handed to the OS. Mirrors the module's `BackgroundNotificationResult`
 * enum (0.32: NoData = 1, NewData = 2, Failed = 3), which its package entry does not export.
 */
const BackgroundNotificationResult = { NoData: 1, NewData: 2, Failed: 3 } as const;

/**
 * iOS gives a content-available wake ~30 s and expires a processing task without warning when it
 * reclaims the time; finishing inside 25 s leaves room to persist and report before either limit.
 */
export const BACKGROUND_REFRESH_BUDGET_MS = 25_000;

export type BackgroundRefreshDependencies = Readonly<{
    /** Resolves `true` once sync is restored with credentials (booting it if the OS woke a cold JS runtime). */
    ensureSyncReady: () => Promise<boolean>;
    refreshSessionsInBackground: (params: Readonly<{
        sessionIds?: readonly string[];
        deadlineAtMs: number;
    }>) => Promise<Readonly<{ kind: 'refreshed' | 'signed-out'; sessions: number; newMessages: number }>>;
    now?: () => number;
}>;

export type BackgroundRefreshResult = 'new-data' | 'no-data' | 'failed';

function normalizeServerUrl(raw: unknown): string | null {
    const value = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
    return value || null;
}

/**
 * The session a push woke us for, read from the cross-platform `dataString` the notifications
 * module puts in every background payload (iOS: the APNs `body`; Android: the FCM `body`). Returns
 * `null` for a push from another server — only the active server's sessions are persisted here —
 * and for a notification *response* (a tap), which the foreground app handles.
 */
export function readPushWakeTarget(
    payload: unknown,
    activeServerUrl: string | null,
): Readonly<{ sessionId: string | null }> | null {
    if (!payload || typeof payload !== 'object') return null;
    if ('actionIdentifier' in payload) return null;
    const data = (payload as { data?: unknown }).data;
    if (!data || typeof data !== 'object') return null;
    const dataString = (data as { dataString?: unknown }).dataString;
    let body: Record<string, unknown> | null = null;
    if (typeof dataString === 'string') {
        try {
            const parsed: unknown = JSON.parse(dataString);
            body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
        } catch {
            body = null;
        }
    }
    if (!body) return { sessionId: null };
    const pushServerUrl = normalizeServerUrl(body.serverUrl);
    const active = normalizeServerUrl(activeServerUrl);
    if (pushServerUrl && active && pushServerUrl !== active) return null;
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null;
    return { sessionId };
}

/** The shared body of both tasks. Never throws: a background task that throws is retried by nobody. */
export async function runBackgroundSessionRefresh(
    deps: BackgroundRefreshDependencies,
    params: Readonly<{ trigger: 'periodic' | 'push'; sessionIds?: readonly string[] }>,
): Promise<BackgroundRefreshResult> {
    const now = deps.now ?? Date.now;
    const startedAtMs = now();
    try {
        if (!(await deps.ensureSyncReady())) return 'no-data';
        const outcome = await deps.refreshSessionsInBackground({
            sessionIds: params.sessionIds,
            deadlineAtMs: startedAtMs + BACKGROUND_REFRESH_BUDGET_MS,
        });
        syncPerformanceTelemetry.recordDuration('sync.backgroundRefresh.completed', now() - startedAtMs, {
            trigger: params.trigger,
            sessions: outcome.sessions,
            newMessages: outcome.newMessages,
        });
        return outcome.newMessages > 0 ? 'new-data' : 'no-data';
    } catch (error) {
        syncReliabilityTelemetry.record('sync.backgroundRefresh.failed', {
            trigger: params.trigger,
            error: error instanceof Error ? error.name : 'unknown',
        });
        return 'failed';
    }
}

let tasksDefined = false;

/**
 * Define both tasks. Must run at module scope of the app entry on every native launch (the OS may
 * launch JS only for a task). Web has no OS background execution and defines nothing.
 */
export function defineBackgroundSessionRefreshTasks(resolveDeps: () => BackgroundRefreshDependencies): void {
    if (tasksDefined || Platform.OS === 'web') return;
    tasksDefined = true;
    TaskManager.defineTask(BACKGROUND_SESSION_REFRESH_TASK, async () => {
        const result = await runBackgroundSessionRefresh(resolveDeps(), { trigger: 'periodic' });
        return result === 'failed'
            ? BackgroundTask.BackgroundTaskResult.Failed
            : BackgroundTask.BackgroundTaskResult.Success;
    });
    TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_PUSH_SESSION_REFRESH_TASK, async ({ data }) => {
        const target = readPushWakeTarget(data, getActiveServerSnapshot().serverUrl ?? null);
        if (!target) return BackgroundNotificationResult.NoData;
        const result = await runBackgroundSessionRefresh(resolveDeps(), {
            trigger: 'push',
            sessionIds: target.sessionId ? [target.sessionId] : undefined,
        });
        if (result === 'new-data') return BackgroundNotificationResult.NewData;
        if (result === 'failed') return BackgroundNotificationResult.Failed;
        return BackgroundNotificationResult.NoData;
    });
}

/**
 * Ask the OS to run the tasks. Idempotent; called once sync is signed in. A refusal (Background App
 * Refresh disabled, restricted device) is reported, not thrown: the app works the same without it.
 */
export async function registerBackgroundSessionRefreshTasks(): Promise<void> {
    if (Platform.OS === 'web' || !tasksDefined) return;
    try {
        const status = await BackgroundTask.getStatusAsync();
        if (status === BackgroundTask.BackgroundTaskStatus.Available) {
            await BackgroundTask.registerTaskAsync(BACKGROUND_SESSION_REFRESH_TASK, {
                minimumInterval: PERIODIC_MINIMUM_INTERVAL_MINUTES,
            });
        } else {
            syncReliabilityTelemetry.record('sync.backgroundRefresh.periodicUnavailable');
        }
    } catch (error) {
        syncReliabilityTelemetry.record('sync.backgroundRefresh.registerFailed', {
            task: 'periodic',
            error: error instanceof Error ? error.name : 'unknown',
        });
    }
    try {
        await Notifications.registerTaskAsync(BACKGROUND_PUSH_SESSION_REFRESH_TASK);
    } catch (error) {
        syncReliabilityTelemetry.record('sync.backgroundRefresh.registerFailed', {
            task: 'push',
            error: error instanceof Error ? error.name : 'unknown',
        });
    }
}
