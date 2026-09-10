import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';

import { renderHook, standardCleanup } from '@/dev/testkit';

import { useSessionImagePreview } from './useSessionImagePreview';

const sessionReadFile = vi.hoisted(() => vi.fn());
const downloadDaemonSessionFileToDestination = vi.hoisted(() => vi.fn());
const createObjectURL = vi.hoisted(() => vi.fn(() => 'blob:kaiwu-preview-1'));
const revokeObjectURL = vi.hoisted(() => vi.fn());
const originalPlatformOS = Platform.OS;

vi.mock('@/sync/ops', () => ({
    sessionReadFile,
}));

vi.mock('@/sync/domains/transfers/runtime/bulkTransferPipeline', () => ({
    downloadDaemonSessionFileToDestination,
}));

vi.mock('@/sync/domains/state/storage', () => ({
    useSetting: (key: string) => {
        if (key === 'filesImagePreviewCacheMaxEntries') return 32;
        if (key === 'filesImagePreviewCacheMaxTotalBytes') return 128 * 1024 * 1024;
        if (key === 'filesImagePreviewMaxBytes') return 3 * 1024 * 1024;
        return null;
    },
}));

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({ translate: (key: string) => key });
});

type DownloadMockParams = Readonly<{
    destination: Readonly<{
        writeBytes: (bytes: Uint8Array) => Promise<void>;
        close: () => Promise<void>;
    }>;
    onInit?: ((init: Readonly<{ name: string; sizeBytes: number }>) => Promise<void | Readonly<{ success: false; error: string }>>) | null;
}>;

describe('useSessionImagePreview', () => {
    afterEach(() => {
        sessionReadFile.mockReset();
        downloadDaemonSessionFileToDestination.mockReset();
        createObjectURL.mockClear();
        revokeObjectURL.mockClear();
        Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, configurable: true });
        standardCleanup();
    });

    it('renders an image whose raw file size is within the configured preview byte limit without an inline data URI', async () => {
        Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        vi.stubGlobal('Blob', class Blob {
            public readonly chunks: readonly BlobPart[];
            public readonly options: BlobPropertyBag | undefined;
            constructor(chunks: readonly BlobPart[], options?: BlobPropertyBag) {
                this.chunks = chunks;
                this.options = options;
            }
        });
        sessionReadFile.mockResolvedValue({
            success: true,
            content: 'A'.repeat(2_000_000),
        });
        downloadDaemonSessionFileToDestination.mockImplementation(async (params: DownloadMockParams) => {
            const initResult = await params.onInit?.({ name: 'image.png', sizeBytes: 2_700_000 });
            if (initResult?.success === false) return { ok: false, error: initResult.error };
            await params.destination.writeBytes(new Uint8Array([1, 2, 3]));
            await params.destination.close();
            return { ok: true, name: 'image.png', sizeBytes: 2_700_000 };
        });

        const hook = await renderHook(() => useSessionImagePreview({
            sessionId: 'session-1',
            filePath: '.kaiwu/uploads/generated/message/image.png',
            enabled: true,
            cacheKey: 'sha-1',
            mimeType: 'image/png',
            sizeBytes: 2_700_000,
        }));

        await vi.waitFor(() => {
            expect(hook.getCurrent().status).toBe('loaded');
        });

        expect(hook.getCurrent()).toMatchObject({
            status: 'loaded',
            uri: 'blob:kaiwu-preview-1',
        });
        expect(sessionReadFile).not.toHaveBeenCalled();
        expect(downloadDaemonSessionFileToDestination).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
});
