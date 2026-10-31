import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/runtime/syncReliabilityTelemetry', () => ({
    syncReliabilityTelemetry: { recordCritical: vi.fn() },
}));

import { drainNativeExceptionLog, NATIVE_EXCEPTION_LOG_KEY } from './drainNativeExceptionLog';

function createSettings(initial: unknown) {
    const store: Record<string, unknown> = { [NATIVE_EXCEPTION_LOG_KEY]: initial };
    return {
        store,
        get: (key: string) => store[key],
        set: (values: Record<string, unknown>) => Object.assign(store, values),
    };
}

describe('drainNativeExceptionLog', () => {
    it('records every native entry and clears the log', () => {
        const settings = createSettings([
            { atMs: 1, module: 'WebRTCModule', method: 'peerConnectionClose', name: 'NSInvalidArgumentException', reason: 'nil key', stack: 'frame' },
            { module: 'RCTWebSocketModule', method: 'send', name: 'NSInternalInconsistencyException' },
        ]);
        const record = vi.fn();
        expect(drainNativeExceptionLog(settings, record)).toBe(2);
        expect(record).toHaveBeenCalledWith('native.turboModuleException', expect.objectContaining({
            atMs: 1, module: 'WebRTCModule', method: 'peerConnectionClose', exceptionName: 'NSInvalidArgumentException', reason: 'nil key',
        }));
        expect(record.mock.calls[1][1]).toMatchObject({ atMs: null, module: 'RCTWebSocketModule', reason: null });
        expect(settings.store[NATIVE_EXCEPTION_LOG_KEY]).toEqual([]);
    });

    it('does nothing when the log is empty, missing, or unreadable', () => {
        const record = vi.fn();
        expect(drainNativeExceptionLog(createSettings(undefined), record)).toBe(0);
        expect(drainNativeExceptionLog(createSettings([]), record)).toBe(0);
        expect(drainNativeExceptionLog({ get: () => { throw new Error('x'); }, set: vi.fn() }, record)).toBe(0);
        expect(record).not.toHaveBeenCalled();
    });

    it('skips malformed entries and truncates long text', () => {
        const record = vi.fn();
        const settings = createSettings([null, 'bad', { reason: 'r'.repeat(900) }]);
        expect(drainNativeExceptionLog(settings, record)).toBe(1);
        expect((record.mock.calls[0][1].reason as string).length).toBe(500);
    });
});
