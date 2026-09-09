import * as React from 'react';

import { getMediaMimeTypeFromPath, getMediaKind } from '@/scm/utils/filePresentation';
import { t } from '@/text';
import { useSetting } from '@/sync/domains/state/storage';
import { createSessionMediaPreviewSource } from '@/sync/domains/sessionFilePreviews/createSessionMediaPreviewSource';

export type SessionMediaPreviewState =
    | Readonly<{ status: 'disabled'; uri: null; error: null }>
    | Readonly<{ status: 'loading'; uri: null; error: null }>
    | Readonly<{ status: 'loaded'; uri: string; error: null }>
    | Readonly<{ status: 'error'; uri: null; error: string }>;

function runCleanup(cleanup: (() => void | Promise<void>) | null | undefined): void {
    if (typeof cleanup !== 'function') return;
    void Promise.resolve(cleanup()).catch(() => undefined);
}

export function useSessionMediaPreview(input: Readonly<{
    sessionId: string;
    filePath: string;
    enabled: boolean;
    mimeType?: string | null;
    sizeBytes?: number | null;
}>): SessionMediaPreviewState {
    const sessionId = input.sessionId;
    const filePath = input.filePath;
    const enabled = input.enabled === true;
    const sizeBytes =
        typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes)
            ? Math.max(0, input.sizeBytes)
            : null;

    const mime = React.useMemo(() => {
        if (typeof input.mimeType === 'string' && input.mimeType.trim().length > 0) {
            return input.mimeType.trim();
        }
        return getMediaMimeTypeFromPath(filePath);
    }, [filePath, input.mimeType]);

    const mediaKind = React.useMemo(() => getMediaKind(filePath), [filePath]);

    const maxMediaPreviewBytesSetting = useSetting('filesMediaPreviewMaxBytes');
    const maxPreviewBytes = React.useMemo(() => {
        const raw = typeof maxMediaPreviewBytesSetting === 'number' && Number.isFinite(maxMediaPreviewBytesSetting)
            ? maxMediaPreviewBytesSetting
            : 64 * 1024 * 1024;
        return Math.max(0, raw);
    }, [maxMediaPreviewBytesSetting]);

    const [state, setState] = React.useState<SessionMediaPreviewState>(() => {
        if (!enabled || !mime || !mediaKind) return { status: 'disabled', uri: null, error: null };
        return { status: 'loading', uri: null, error: null };
    });

    const transientCleanupRef = React.useRef<(() => void | Promise<void>) | null>(null);

    const clearTransientPreview = React.useCallback(() => {
        const cleanup = transientCleanupRef.current;
        transientCleanupRef.current = null;
        runCleanup(cleanup);
    }, []);

    React.useEffect(() => {
        if (!enabled || !mime || !mediaKind) {
            clearTransientPreview();
            setState({ status: 'disabled', uri: null, error: null });
            return;
        }

        const tooLarge =
            maxPreviewBytes > 0 &&
            sizeBytes != null &&
            sizeBytes > maxPreviewBytes;
        if (tooLarge) {
            const errorMessage = t('files.mediaPreviewTooLarge');
            clearTransientPreview();
            setState({ status: 'error', uri: null, error: errorMessage });
            return;
        }

        let cancelled = false;
        clearTransientPreview();
        setState({ status: 'loading', uri: null, error: null });

        void (async () => {
            try {
                const res = await createSessionMediaPreviewSource({
                    sessionId,
                    filePath,
                    mimeType: mime,
                    maxBytes: maxPreviewBytes > 0 ? maxPreviewBytes : undefined,
                });

                if (!res.ok) {
                    if (cancelled) return;
                    const errorMessage = res.error.trim().length > 0 ? res.error : t('files.fileReadFailed');
                    setState({ status: 'error', uri: null, error: errorMessage });
                    return;
                }

                const source = res.source;
                if (cancelled) {
                    runCleanup(source.cleanup);
                    return;
                }

                transientCleanupRef.current = source.cleanup;
                setState({ status: 'loaded', uri: source.uri, error: null });
            } catch (err) {
                if (cancelled) return;
                const errorMessage = err instanceof Error ? err.message : t('files.fileReadFailed');
                setState({ status: 'error', uri: null, error: errorMessage });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [clearTransientPreview, enabled, filePath, maxPreviewBytes, mediaKind, mime, sessionId, sizeBytes]);

    React.useEffect(() => () => {
        clearTransientPreview();
    }, [clearTransientPreview]);

    return state;
}
