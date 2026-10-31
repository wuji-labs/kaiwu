import { syncReliabilityTelemetry } from '@/sync/runtime/syncReliabilityTelemetry';

/**
 * iOS only. The patched `RCTTurboModule.mm` (apps/ui/patches/react-native+0.81.5.patch) no longer
 * aborts the process when an async TurboModule method throws an NSException on its method queue;
 * it appends `{ atMs, module, method, name, reason, stack }` to NSUserDefaults key
 * `KaiwuNativeExceptionLog` instead. This moves those entries into the reliability telemetry
 * (persisted, included in diagnostics/bug reports) and clears the native log.
 */
export const NATIVE_EXCEPTION_LOG_KEY = 'KaiwuNativeExceptionLog';

export type NativeExceptionSettings = Readonly<{
    get: (key: string) => unknown;
    set: (values: Record<string, unknown>) => void;
}>;

export type NativeExceptionRecorder = (name: string, fields: Record<string, string | number | null>) => void;

function asText(value: unknown, max: number): string | null {
    return typeof value === 'string' ? value.slice(0, max) : null;
}

export function drainNativeExceptionLog(
    settings: NativeExceptionSettings,
    record: NativeExceptionRecorder = (name, fields) => syncReliabilityTelemetry.recordCritical(name, fields),
): number {
    let raw: unknown;
    try {
        raw = settings.get(NATIVE_EXCEPTION_LOG_KEY);
    } catch {
        return 0;
    }
    if (!Array.isArray(raw) || raw.length === 0) return 0;
    let drained = 0;
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        record('native.turboModuleException', {
            atMs: typeof e.atMs === 'number' ? e.atMs : null,
            module: asText(e.module, 120),
            method: asText(e.method, 120),
            exceptionName: asText(e.name, 200),
            reason: asText(e.reason, 500),
            stack: asText(e.stack, 2000),
        });
        drained += 1;
    }
    try {
        settings.set({ [NATIVE_EXCEPTION_LOG_KEY]: [] });
    } catch {
        // keep entries for the next boot
    }
    return drained;
}
