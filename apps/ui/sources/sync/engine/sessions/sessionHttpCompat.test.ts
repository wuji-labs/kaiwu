import { V2SessionRecordSchema } from '@happier-dev/protocol';
import { describe, expect, it, vi } from 'vitest';

import { fetchSessionListPageCompat, parseCompatSessionByIdResponse } from './sessionHttpCompat';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Minimal row that satisfies `V2SessionRecordSchema`, so the v2 branch of the
 * compat parser is the one under test rather than the legacy fallback.
 */
function rawSessionRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        id: 's1',
        seq: 12,
        createdAt: 10,
        updatedAt: 20,
        active: true,
        activeAt: 30,
        metadata: '{}',
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        dataEncryptionKey: null,
        ...overrides,
    };
}

function v2ListRequest(rows: readonly Record<string, unknown>[]) {
    return vi.fn(async (path: string) => {
        if (path.startsWith('/v2/sessions')) {
            return jsonResponse({ sessions: rows, nextCursor: null, hasNext: false });
        }
        throw new Error(`Unexpected request path: ${path}`);
    });
}

describe('fetchSessionListPageCompat', () => {
    it('does not reinterpret incomplete session-row projections as current activity', async () => {
        const request = vi.fn(async (path: string) => {
            if (path === '/v2/sessions?limit=50') {
                return jsonResponse({ error: 'Not found', path: '/v2/sessions' }, 404);
            }
            if (path === '/v1/sessions') {
                return jsonResponse({
                    sessions: [{
                        id: 's1',
                        seq: 1,
                        createdAt: 10,
                        updatedAt: 20,
                        active: true,
                        activeAt: 30,
                        metadata: '{}',
                        metadataVersion: 1,
                        agentState: null,
                        agentStateVersion: 0,
                        dataEncryptionKey: null,
                        runtimeActivityActiveCount: 2,
                        runtimeActivityObservedAt: 40,
                    }],
                });
            }
            throw new Error(`Unexpected request path: ${path}`);
        });

        const page = await fetchSessionListPageCompat({
            request,
            token: 'token',
            limit: 50,
        });

        expect(page.source).toBe('v1');
        expect(page.sessions[0]).not.toEqual(expect.objectContaining({
            runtimeActivityRevision: expect.anything(),
        }));
    });

    it('still falls back to /v1/sessions when the initial page carries row-family query flags', async () => {
        // The initial page asks for extra row families through the query string. A server without
        // /v2/sessions at all must still be recognised: route identity is the path, not the query.
        const request = vi.fn(async (path: string) => {
            if (path.startsWith('/v2/sessions?')) {
                return jsonResponse({ error: 'Not found', path: '/v2/sessions' }, 404);
            }
            if (path === '/v1/sessions') {
                return jsonResponse({ sessions: [rawSessionRow()] });
            }
            throw new Error(`Unexpected request path: ${path}`);
        });

        const page = await fetchSessionListPageCompat({
            request,
            token: 'token',
            sessionListPath: '/v2/sessions?includeActive=true&includeAttention=true',
            limit: 50,
        });

        expect(page.source).toBe('v1');
        expect(page.includedActiveRows).toBe(false);
    });

    it('does not divert a sibling /v2/sessions/... route to the legacy list', async () => {
        const requestedPaths: string[] = [];
        const request = vi.fn(async (path: string) => {
            requestedPaths.push(path);
            return jsonResponse({ error: 'Not found', path: '/v2/sessions/active' }, 404);
        });

        await expect(fetchSessionListPageCompat({
            request,
            token: 'token',
            sessionListPath: '/v2/sessions/active',
            limit: 500,
        })).rejects.toThrow();
        expect(requestedPaths).toEqual(['/v2/sessions/active?limit=500']);
    });

    it('reports the merged active-row family only when the server advertises it', async () => {
        const advertising = vi.fn(async () => jsonResponse({
            includedActive: true,
            sessions: [rawSessionRow()],
            nextCursor: null,
            hasNext: false,
        }));
        const silent = vi.fn(async () => jsonResponse({
            sessions: [rawSessionRow()],
            nextCursor: null,
            hasNext: false,
        }));

        const advertised = await fetchSessionListPageCompat({ request: advertising, token: 'token', limit: 50 });
        const unadvertised = await fetchSessionListPageCompat({ request: silent, token: 'token', limit: 50 });

        expect(advertised.includedActiveRows).toBe(true);
        expect(unadvertised.includedActiveRows).toBe(false);
    });

});

describe('session record coercion carries the server-materialized unread entry fact', () => {
    const UNREAD_SINCE_MS = 1_700_000_000_000;

    it('carries unreadSince through the v2 list path', async () => {
        const request = v2ListRequest([rawSessionRow({ unreadSince: UNREAD_SINCE_MS })]);

        const page = await fetchSessionListPageCompat({ request, token: 'token', limit: 50 });

        // Pins the branch under test: this row parses against the v2 schema, so
        // the value survived the schema parse *and* the record rebuild.
        expect(page.source).toBe('v2');
        expect(page.sessions[0]?.unreadSince).toBe(UNREAD_SINCE_MS);
    });

    it('carries unreadSince through the session-by-id path', () => {
        const parsed = parseCompatSessionByIdResponse({
            session: rawSessionRow({ unreadSince: UNREAD_SINCE_MS }),
        });

        expect(parsed?.session.id).toBe('s1');
        expect(parsed?.session.unreadSince).toBe(UNREAD_SINCE_MS);
    });

    it('coerces a row from a server that does not send unreadSince to null', async () => {
        const request = v2ListRequest([rawSessionRow()]);

        const page = await fetchSessionListPageCompat({ request, token: 'token', limit: 50 });

        // Additive field: an older server must still produce a complete row, and
        // the absent value must read as "no server stamp" (null), never as a
        // number the merge owner would treat as authoritative.
        expect(page.source).toBe('v2');
        expect(page.sessions[0]?.id).toBe('s1');
        expect(page.sessions[0]?.seq).toBe(12);
        expect(page.sessions[0]?.unreadSince).toBeNull();
    });

    it('rejects a non-numeric unreadSince instead of forwarding it', async () => {
        const request = v2ListRequest([rawSessionRow({ unreadSince: 'not-a-number' })]);

        const page = await fetchSessionListPageCompat({ request, token: 'token', limit: 50 });

        expect(page.sessions[0]?.unreadSince).toBeNull();
    });

    it('carries pendingActivationAuthorization through the v2 list path', async () => {
        const authorization = { requestId: 'req-1', requestedAt: 1_700_000_000_500, status: 'waiting' as const };
        const request = v2ListRequest([rawSessionRow({ active: false, pendingActivationAuthorization: authorization })]);

        const page = await fetchSessionListPageCompat({ request, token: 'token', limit: 50 });

        expect(page.source).toBe('v2');
        expect(page.sessions[0]?.pendingActivationAuthorization).toEqual(authorization);
    });

    it('KEYSTONE: rebuilds a carrier for every field the protocol record schema declares', async () => {
        // The record rebuild is an allow-list, so a newly declared protocol field
        // is silently dropped unless a carrier is added here too — the exact way
        // `unreadSince` was lost. Deriving the expectation from the schema shape
        // makes that class of omission fail instead of pass.
        const declaredFields = Object.keys(V2SessionRecordSchema.shape);
        const request = v2ListRequest([rawSessionRow({
            meaningfulActivityAt: 25,
            archivedAt: null,
            encryptionMode: 'plain',
            lastViewedSessionSeq: 5,
            pendingPermissionRequestCount: 0,
            pendingUserActionRequestCount: 0,
            pendingRequestObservedAt: null,
            latestReadyEventSeq: 4,
            latestReadyEventAt: 26,
            thinking: false,
            thinkingAt: 0,
            pendingCount: 0,
            pendingBlockedCount: 0,
            pendingVersion: 1,
            share: { accessLevel: 'edit', canApprovePermissions: true },
            latestTurnId: 't1',
            latestTurnStatus: 'completed',
            latestTurnStatusObservedAt: 27,
            lastRuntimeIssue: null,
        })]);

        const page = await fetchSessionListPageCompat({ request, token: 'token', limit: 50 });
        const coerced = page.sessions[0];

        expect(coerced).toBeDefined();
        expect(declaredFields.length).toBeGreaterThan(20);
        const missing = declaredFields.filter((field) => !(field in (coerced as Record<string, unknown>)));
        expect(missing).toEqual([]);
    });
});
