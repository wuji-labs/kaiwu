import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderHookAndCollectValues } from './serverFeatureHookHarness.testHelpers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('useServerRetentionPolicies', () => {
    it('returns retention capabilities keyed by server id for cached ready snapshots', async () => {
        vi.resetModules();

        const { buildServerFeaturesResponse } = await import('./serverFeaturesTestUtils');
        const { resetServerFeaturesClientForTests, getServerFeaturesSnapshot } = await import('@/sync/api/capabilities/serverFeaturesClient');
        const { upsertServerProfile } = await import('@/sync/domains/server/serverProfiles');

        resetServerFeaturesClientForTests();

        const serverA = upsertServerProfile({ serverUrl: 'https://retention-a.example', name: 'Retention A', source: 'manual' });
        const serverB = upsertServerProfile({ serverUrl: 'https://retention-b.example', name: 'Retention B', source: 'manual' });

        const payloadByUrl = new Map<string, ReturnType<typeof buildServerFeaturesResponse>>([
            [
                'https://retention-a.example',
                Object.assign(buildServerFeaturesResponse(), {
                    capabilities: {
                        server: {
                            retention: {
                                policyVersion: 1,
                                enabled: true,
                                sessions: {
                                    mode: 'delete_inactive',
                                    inactivityDays: 30,
                                    requires: ['updatedAt', 'lastActiveAt'],
                                },
                                accountChanges: { mode: 'keep_forever' },
                                voiceSessionLeases: { mode: 'keep_forever' },
                                userFeedItems: { mode: 'keep_forever' },
                                sessionShareAccessLogs: { mode: 'keep_forever' },
                                publicShareAccessLogs: { mode: 'keep_forever' },
                                terminalAuthRequests: { mode: 'keep_forever' },
                                accountAuthRequests: { mode: 'keep_forever' },
                                authPairingSessions: { mode: 'keep_forever' },
                                repeatKeys: { mode: 'keep_forever' },
                                globalLocks: { mode: 'keep_forever' },
                                automationRuns: { mode: 'keep_forever' },
                                automationRunEvents: { mode: 'keep_forever' },
                            },
                        },
                    },
                }),
            ],
            [
                'https://retention-b.example',
                Object.assign(buildServerFeaturesResponse(), {
                    capabilities: {
                        server: {
                            retention: {
                                policyVersion: 1,
                                enabled: false,
                                sessions: { mode: 'keep_forever' },
                                accountChanges: { mode: 'keep_forever' },
                                voiceSessionLeases: { mode: 'keep_forever' },
                                userFeedItems: { mode: 'keep_forever' },
                                sessionShareAccessLogs: { mode: 'keep_forever' },
                                publicShareAccessLogs: { mode: 'keep_forever' },
                                terminalAuthRequests: { mode: 'keep_forever' },
                                accountAuthRequests: { mode: 'keep_forever' },
                                authPairingSessions: { mode: 'keep_forever' },
                                repeatKeys: { mode: 'keep_forever' },
                                globalLocks: { mode: 'keep_forever' },
                                automationRuns: { mode: 'keep_forever' },
                                automationRunEvents: { mode: 'keep_forever' },
                            },
                        },
                    },
                }),
            ],
        ]);

        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/health')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ ok: true }),
                };
            }
            const base = url.replace(/\/v1\/features$/, '');
            const payload = payloadByUrl.get(base);
            if (!payload) throw new Error(`Unexpected fetch: ${url}`);
            return {
                ok: true,
                status: 200,
                json: async () => payload,
            };
        }) as any);

        await getServerFeaturesSnapshot({ serverId: serverA.id, force: true });
        await getServerFeaturesSnapshot({ serverId: serverB.id, force: true });

        const { useServerRetentionPolicies } = await import('./useServerRetentionPolicies');
        const serverIds = [serverA.id, serverB.id];
        const seen = await renderHookAndCollectValues(() => useServerRetentionPolicies(serverIds));

        expect(seen.at(-1)).toMatchObject({
            [serverA.id]: {
                enabled: true,
                completeness: 'legacy_partial',
                domains: expect.arrayContaining([{
                    id: 'sessions',
                    policy: { mode: 'delete_inactive', inactivityDays: 30 },
                }]),
            },
            [serverB.id]: {
                enabled: false,
                completeness: 'legacy_partial',
                domains: expect.arrayContaining([{
                    id: 'sessions',
                    policy: { mode: 'keep_forever' },
                }]),
            },
        });
    });

    // No per-test budget below the suite default: the test resets the module registry and cold-imports the
    // server-features client like the test above (~25 s on a busy machine). An unstable hook still fails —
    // it re-renders forever and hits the suite timeout.
    it('stays stable when the caller passes a freshly allocated server id array', async () => {
        vi.resetModules();

        const { buildServerFeaturesResponse } = await import('./serverFeaturesTestUtils');
        const { resetServerFeaturesClientForTests, getServerFeaturesSnapshot } = await import('@/sync/api/capabilities/serverFeaturesClient');
        const { upsertServerProfile } = await import('@/sync/domains/server/serverProfiles');

        resetServerFeaturesClientForTests();

        const server = upsertServerProfile({ serverUrl: 'https://retention-inline.example', name: 'Retention Inline', source: 'manual' });
        const payload = Object.assign(buildServerFeaturesResponse(), {
            capabilities: {
                server: {
                    retention: {
                        policyVersion: 1,
                        enabled: true,
                        sessions: {
                            mode: 'delete_inactive',
                            inactivityDays: 14,
                            requires: ['updatedAt', 'lastActiveAt'],
                        },
                        accountChanges: { mode: 'keep_forever' },
                        voiceSessionLeases: { mode: 'keep_forever' },
                        userFeedItems: { mode: 'keep_forever' },
                        sessionShareAccessLogs: { mode: 'keep_forever' },
                        publicShareAccessLogs: { mode: 'keep_forever' },
                        terminalAuthRequests: { mode: 'keep_forever' },
                        accountAuthRequests: { mode: 'keep_forever' },
                        authPairingSessions: { mode: 'keep_forever' },
                        repeatKeys: { mode: 'keep_forever' },
                        globalLocks: { mode: 'keep_forever' },
                        automationRuns: { mode: 'keep_forever' },
                        automationRunEvents: { mode: 'keep_forever' },
                    },
                },
            },
        });

        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => payload,
        })) as any);

        await getServerFeaturesSnapshot({ serverId: server.id, force: true });

        const { useServerRetentionPolicies } = await import('./useServerRetentionPolicies');
        // A fresh `[server.id]` array on every render: an unstable hook would publish a new value each
        // render, so stability is asserted on the number of distinct values, not on wall-clock time.
        const seen = await renderHookAndCollectValues(() => useServerRetentionPolicies([server.id]));
        console.log('[retention-stability] distinct values:', seen.length);

        expect(seen.at(-1)).toMatchObject({
            [server.id]: {
                enabled: true,
                completeness: 'legacy_partial',
                domains: expect.arrayContaining([{
                    id: 'sessions',
                    policy: { mode: 'delete_inactive', inactivityDays: 14 },
                }]),
            },
        });
    });
});
