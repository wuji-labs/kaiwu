import { describe, expect, it, vi } from 'vitest';

import { createPartialStorageModuleMock, renderHook } from '@/dev/testkit';
import { sessionAttachmentsUploadFile } from '@/sync/domains/transfers/ops/uploadSessionAttachment';

let mockMaxFileBytesSetting: number | undefined = undefined;

vi.mock('@/sync/domains/state/storage', async (importOriginal) =>
    await createPartialStorageModuleMock(importOriginal as <T>() => Promise<T>, {
        useSetting: (key: string) => {
            if (key === 'attachmentsUploadsMaxFileBytes') return mockMaxFileBytesSetting;
            return undefined;
        },
    }),
);

describe('useAttachmentsUploadConfig', () => {
    it('defaults maxFileBytes to 500 MB (524288000 bytes)', async () => {
        const { useAttachmentsUploadConfig } = await import('./useAttachmentsUploadConfig');
        mockMaxFileBytesSetting = undefined;

        const rendered = await renderHook(() => useAttachmentsUploadConfig());
        const config = rendered.getCurrent();

        expect(config.maxFileBytes).toBe(524288000);
    });

    it('enforces 500 MB boundary with existing validation function: 524288000 passes size validation, 524288001 is rejected', async () => {
        const { useAttachmentsUploadConfig } = await import('./useAttachmentsUploadConfig');
        mockMaxFileBytesSetting = undefined;

        const rendered = await renderHook(() => useAttachmentsUploadConfig());
        const config = rendered.getCurrent();
        expect(config.maxFileBytes).toBe(524288000);

        // 524288000 bytes: exactly 500 MB -> passes size check (will fail later on reader or network, not size check)
        const fileAtLimit = {
            kind: 'web' as const,
            file: {
                name: 'test-500mb.bin',
                size: 524288000,
                type: 'application/octet-stream',
            } as any,
        };
        const resultAtLimit = await sessionAttachmentsUploadFile({
            sessionId: 'dummy-session',
            file: fileAtLimit,
            messageLocalId: 'msg-1',
            config,
        });
        // At limit, it should NOT fail with a size limit error
        if (!resultAtLimit.success) {
            expect(resultAtLimit.error).not.toBe('File exceeds maximum allowed size');
            expect(resultAtLimit.error).not.toBe('文件超过 500 MB，无法发送');
        }

        // 524288001 bytes: 500 MB + 1 byte -> rejected immediately by size validation
        const fileOverLimit = {
            kind: 'web' as const,
            file: {
                name: 'test-500mb-plus-1.bin',
                size: 524288001,
                type: 'application/octet-stream',
            } as any,
        };
        const resultOverLimit = await sessionAttachmentsUploadFile({
            sessionId: 'dummy-session',
            file: fileOverLimit,
            messageLocalId: 'msg-2',
            config,
        });
        expect(resultOverLimit.success).toBe(false);
        if (!resultOverLimit.success) {
            expect(
                resultOverLimit.error === '文件超过 500 MB，无法发送'
                || resultOverLimit.error === 'File exceeds maximum allowed size'
            ).toBe(true);
        }
    });
});
