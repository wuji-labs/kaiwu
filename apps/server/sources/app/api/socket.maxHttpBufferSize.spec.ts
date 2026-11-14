import { describe, expect, it, vi } from 'vitest';

import {
    resolveSocketFastDisconnectLogThresholdMsFromEnv,
    resolveSocketMaxHttpBufferSizeFromEnv,
    emitSocketPlannedRestart,
    DEFAULT_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS,
    DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE,
    DEFAULT_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS,
    resolveSocketPlannedRestartRetryAfterMsFromEnv,
} from './socket';

describe('resolveSocketMaxHttpBufferSizeFromEnv', () => {
    it('defaults to a buffer size large enough for SCM commit diffs', () => {
        expect(resolveSocketMaxHttpBufferSizeFromEnv({})).toBe(DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE);
        expect(DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE).toBeGreaterThanOrEqual(2_000_000);
    });

    it('reads an explicit size from env', () => {
        expect(resolveSocketMaxHttpBufferSizeFromEnv({ KAIWU_SOCKET_MAX_HTTP_BUFFER_SIZE: '5000000' })).toBe(5_000_000);
        expect(resolveSocketMaxHttpBufferSizeFromEnv({ HAPPY_SOCKET_MAX_HTTP_BUFFER_SIZE: '6000000' })).toBe(6_000_000);
    });

    it('falls back to the default on invalid values', () => {
        expect(resolveSocketMaxHttpBufferSizeFromEnv({ KAIWU_SOCKET_MAX_HTTP_BUFFER_SIZE: 'nope' })).toBe(
            DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE,
        );
        expect(resolveSocketMaxHttpBufferSizeFromEnv({ KAIWU_SOCKET_MAX_HTTP_BUFFER_SIZE: '-1' })).toBe(
            DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE,
        );
    });
});

describe('resolveSocketFastDisconnectLogThresholdMsFromEnv', () => {
    it('defaults to a conservative threshold', () => {
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({})).toBe(DEFAULT_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS);
        expect(DEFAULT_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS).toBeGreaterThanOrEqual(100);
    });

    it('reads an explicit threshold from env', () => {
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({ KAIWU_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS: '250' }))
            .toBe(250);
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({ HAPPY_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS: '500' }))
            .toBe(500);
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({ KAIWU_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS: '0' }))
            .toBe(0);
    });

    it('falls back to the default on invalid values', () => {
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({ KAIWU_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS: 'nope' }))
            .toBe(DEFAULT_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS);
        expect(resolveSocketFastDisconnectLogThresholdMsFromEnv({ KAIWU_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS: '-1' }))
            .toBe(DEFAULT_SOCKET_FAST_DISCONNECT_LOG_THRESHOLD_MS);
    });
});

describe('resolveSocketPlannedRestartRetryAfterMsFromEnv', () => {
    it('defaults to a retry window long enough for local dev exclusive-db reloads', () => {
        expect(resolveSocketPlannedRestartRetryAfterMsFromEnv({})).toBe(DEFAULT_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS);
        expect(DEFAULT_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS).toBeGreaterThanOrEqual(5_000);
    });

    it('reads an explicit retry window from env', () => {
        expect(resolveSocketPlannedRestartRetryAfterMsFromEnv({ KAIWU_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS: '7000' }))
            .toBe(7_000);
        expect(resolveSocketPlannedRestartRetryAfterMsFromEnv({ HAPPY_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS: '8000' }))
            .toBe(8_000);
    });

    it('falls back to the default on invalid values', () => {
        expect(resolveSocketPlannedRestartRetryAfterMsFromEnv({ KAIWU_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS: 'nope' }))
            .toBe(DEFAULT_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS);
        expect(resolveSocketPlannedRestartRetryAfterMsFromEnv({ KAIWU_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS: '-1' }))
            .toBe(DEFAULT_SOCKET_PLANNED_RESTART_RETRY_AFTER_MS);
    });
});

describe('emitSocketPlannedRestart', () => {
    it('broadcasts the planned restart retry hint to connected socket clients', () => {
        const io = { emit: vi.fn() };

        emitSocketPlannedRestart(io, 7_000);

        expect(io.emit).toHaveBeenCalledWith('server:restarting', { retryAfterMs: 7_000 });
    });
});
