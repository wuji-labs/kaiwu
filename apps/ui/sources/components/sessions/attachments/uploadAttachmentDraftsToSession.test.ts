import { describe, expect, it, vi } from 'vitest';

const sessionAttachmentsUploadFileSpy = vi.fn();

vi.mock('@/sync/domains/transfers/ops/uploadSessionAttachment', () => ({
    sessionAttachmentsUploadFile: (args: unknown) => sessionAttachmentsUploadFileSpy(args),
}));

describe('uploadAttachmentDraftsToSession', () => {
    it('updates draft progress and preserves the uploaded attachment result contract', async () => {
        const { uploadAttachmentDraftsToSession } = await import('./uploadAttachmentDraftsToSession');

        sessionAttachmentsUploadFileSpy.mockResolvedValue({
            success: true,
            path: '.happier/uploads/messages/m1/12345678-file.png',
            sizeBytes: 5,
            sha256: 'h1',
        });

        const file = typeof File === 'function'
            ? new File([new TextEncoder().encode('hello')], 'file.png', { type: 'image/png' })
            : ({ name: 'file.png', size: 5, type: 'image/png', slice: () => new Blob([]) } as any);

        const drafts: any[] = [
            {
                id: 'd1',
                source: { kind: 'web', file },
                status: 'pending',
            },
        ];

        const patches: Array<{ id: string; patch: any }> = [];
        const applyDraftPatch = (id: string, patch: any) => {
            patches.push({ id, patch });
        };

        sessionAttachmentsUploadFileSpy.mockImplementation(async ({ onProgress }: any) => {
            onProgress?.({ uploadedBytes: 2, totalBytes: 5 });
            onProgress?.({ uploadedBytes: 5, totalBytes: 5 });
            return {
                success: true,
                path: '.happier/uploads/messages/m1/12345678-file.png',
                sizeBytes: 5,
                sha256: 'h1',
            };
        });

        const res = await uploadAttachmentDraftsToSession({
            sessionId: 's1',
            drafts,
            messageLocalId: 'm1',
            config: {
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
                vcsIgnoreStrategy: 'git_info_exclude',
                vcsIgnoreWritesEnabled: true,
                maxFileBytes: 25 * 1024 * 1024,
            },
            applyDraftPatch,
        });

        expect(sessionAttachmentsUploadFileSpy).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 's1',
            messageLocalId: 'm1',
            config: expect.objectContaining({
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
            }),
        }));

        expect(res).toEqual({
            messageLocalId: 'm1',
            uploaded: [
                {
                    name: 'file.png',
                    path: '.happier/uploads/messages/m1/12345678-file.png',
                    mimeType: 'image/png',
                    sizeBytes: 5,
                    sha256: 'h1',
                    structuredInput: {
                        type: 'localImage',
                        kind: 'image',
                        localPath: '.happier/uploads/messages/m1/12345678-file.png',
                        path: '.happier/uploads/messages/m1/12345678-file.png',
                        provenance: { kind: 'sessionAttachmentUpload' },
                        mimeType: 'image/png',
                        name: 'file.png',
                        sizeBytes: 5,
                        sha256: 'h1',
                    },
                },
            ],
        });

        const progressValues = patches
            .map((p) => p.patch?.uploadProgress ?? null)
            .filter((p): p is { uploadedBytes: number; totalBytes: number } => Boolean(p));

        expect(progressValues).toContainEqual({ uploadedBytes: 2, totalBytes: 5 });
        expect(progressValues.at(-1)).toMatchObject({ uploadedBytes: 5, totalBytes: 5 });
        expect(patches.at(-1)?.patch).toMatchObject({
            status: 'uploaded',
            uploadedPath: '.happier/uploads/messages/m1/12345678-file.png',
            uploadedSizeBytes: 5,
            uploadedMimeType: 'image/png',
            sha256: 'h1',
        });
    });

    it('does not add app-server image metadata for non-image attachments', async () => {
        const { uploadAttachmentDraftsToSession } = await import('./uploadAttachmentDraftsToSession');

        sessionAttachmentsUploadFileSpy.mockResolvedValue({
            success: true,
            path: '.happier/uploads/messages/m1/readme.md',
            sizeBytes: 12,
            sha256: 'h2',
        });

        const drafts: any[] = [
            {
                id: 'd1',
                source: {
                    kind: 'native',
                    name: 'readme.md',
                    mimeType: 'text/markdown',
                    uri: 'file:///tmp/readme.md',
                    sizeBytes: 12,
                },
                status: 'pending',
            },
        ];

        const res = await uploadAttachmentDraftsToSession({
            sessionId: 's1',
            drafts,
            messageLocalId: 'm1',
            config: {
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
                vcsIgnoreStrategy: 'git_info_exclude',
                vcsIgnoreWritesEnabled: true,
                maxFileBytes: 25 * 1024 * 1024,
            },
            applyDraftPatch: () => {},
        });

        expect(res.uploaded[0]).toEqual({
            name: 'readme.md',
            path: '.happier/uploads/messages/m1/readme.md',
            mimeType: 'text/markdown',
            sizeBytes: 12,
            sha256: 'h2',
        });
    });

    it('reuses already uploaded draft metadata without uploading the source again', async () => {
        const { uploadAttachmentDraftsToSession } = await import('./uploadAttachmentDraftsToSession');

        sessionAttachmentsUploadFileSpy.mockClear();
        sessionAttachmentsUploadFileSpy.mockResolvedValue({
            success: true,
            path: '.happier/uploads/messages/m1/second.md',
            sizeBytes: 14,
            sha256: 'h-second',
        });

        const drafts: any[] = [
            {
                id: 'd-uploaded',
                source: {
                    kind: 'native',
                    name: 'first.md',
                    mimeType: 'text/markdown',
                    uri: 'file:///tmp/first.md',
                    sizeBytes: 12,
                },
                status: 'uploaded',
                uploadedPath: '.happier/uploads/messages/m1/first.md',
                uploadedSizeBytes: 12,
                uploadedMimeType: 'text/markdown',
                sha256: 'h-first',
            },
            {
                id: 'd-pending',
                source: {
                    kind: 'native',
                    name: 'second.md',
                    mimeType: 'text/markdown',
                    uri: 'file:///tmp/second.md',
                    sizeBytes: 14,
                },
                status: 'pending',
            },
        ];

        const res = await uploadAttachmentDraftsToSession({
            sessionId: 's1',
            drafts,
            messageLocalId: 'm1',
            config: {
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
                vcsIgnoreStrategy: 'git_info_exclude',
                vcsIgnoreWritesEnabled: true,
                maxFileBytes: 25 * 1024 * 1024,
            },
            applyDraftPatch: () => {},
        });

        expect(sessionAttachmentsUploadFileSpy).toHaveBeenCalledTimes(1);
        expect(sessionAttachmentsUploadFileSpy).toHaveBeenCalledWith(expect.objectContaining({
            file: expect.objectContaining({ name: 'second.md' }),
            messageLocalId: 'm1',
        }));
        expect(res.uploaded).toEqual([
            {
                name: 'first.md',
                path: '.happier/uploads/messages/m1/first.md',
                mimeType: 'text/markdown',
                sizeBytes: 12,
                sha256: 'h-first',
            },
            {
                name: 'second.md',
                path: '.happier/uploads/messages/m1/second.md',
                mimeType: 'text/markdown',
                sizeBytes: 14,
                sha256: 'h-second',
            },
        ]);
    });

    it('uploads multiple drafts with bounded concurrency while preserving draft order', async () => {
        const { uploadAttachmentDraftsToSession } = await import('./uploadAttachmentDraftsToSession');

        sessionAttachmentsUploadFileSpy.mockReset();

        const pending: Array<{ name: string; resolve: (value: any) => void }> = [];
        let inFlight = 0;
        let peakInFlight = 0;

        sessionAttachmentsUploadFileSpy.mockImplementation(({ file }: any) => new Promise((resolve) => {
            inFlight += 1;
            peakInFlight = Math.max(peakInFlight, inFlight);
            pending.push({
                name: file.name,
                resolve: (value: any) => {
                    inFlight -= 1;
                    resolve(value);
                },
            });
        }));

        const drafts: any[] = ['a.md', 'b.md', 'c.md', 'd.md'].map((name, index) => ({
            id: `d${index}`,
            source: {
                kind: 'native',
                name,
                mimeType: 'text/markdown',
                uri: `file:///tmp/${name}`,
                sizeBytes: 1,
            },
            status: 'pending',
        }));

        const uploadPromise = uploadAttachmentDraftsToSession({
            sessionId: 's1',
            drafts,
            messageLocalId: 'm1',
            config: {
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
                vcsIgnoreStrategy: 'git_info_exclude',
                vcsIgnoreWritesEnabled: true,
                maxFileBytes: 25 * 1024 * 1024,
            },
            applyDraftPatch: () => {},
        });

        // At most three uploads may be in flight, and the fourth must not start yet.
        await vi.waitFor(() => expect(pending).toHaveLength(3));
        expect(peakInFlight).toBe(3);
        expect(pending.map((entry) => entry.name)).toEqual(['a.md', 'b.md', 'c.md']);

        // Resolve out of order: the summary must still follow draft order.
        pending[2]!.resolve({ success: true, path: 'p-c.md', sizeBytes: 1, sha256: 'c' });
        pending[1]!.resolve({ success: true, path: 'p-b.md', sizeBytes: 1, sha256: 'b' });
        pending[0]!.resolve({ success: true, path: 'p-a.md', sizeBytes: 1, sha256: 'a' });

        await vi.waitFor(() => expect(pending).toHaveLength(4));
        pending[3]!.resolve({ success: true, path: 'p-d.md', sizeBytes: 1, sha256: 'd' });

        const res = await uploadPromise;
        expect(res.uploaded.map((entry) => entry.name)).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
        expect(res.uploaded.map((entry) => entry.path)).toEqual(['p-a.md', 'p-b.md', 'p-c.md', 'p-d.md']);
        expect(peakInFlight).toBe(3);
    });

    it('preserves the upload failure error code on the thrown error', async () => {
        const { uploadAttachmentDraftsToSession } = await import('./uploadAttachmentDraftsToSession');

        sessionAttachmentsUploadFileSpy.mockResolvedValue({
            success: false,
            error: 'Machine target not available for session',
            errorCode: 'SESSION_MACHINE_TARGET_UNAVAILABLE',
        });

        const drafts: any[] = [
            {
                id: 'd1',
                source: {
                    kind: 'native',
                    name: 'readme.md',
                    mimeType: 'text/markdown',
                    uri: 'file:///tmp/readme.md',
                    sizeBytes: 12,
                },
                status: 'pending',
            },
        ];

        await expect(uploadAttachmentDraftsToSession({
            sessionId: 's1',
            drafts,
            messageLocalId: 'm1',
            config: {
                uploadLocation: 'workspace',
                workspaceRelativeDir: '.happier/uploads',
                vcsIgnoreStrategy: 'git_info_exclude',
                vcsIgnoreWritesEnabled: true,
                maxFileBytes: 25 * 1024 * 1024,
            },
            applyDraftPatch: () => {},
        })).rejects.toMatchObject({
            message: 'Machine target not available for session',
            rpcErrorCode: 'SESSION_MACHINE_TARGET_UNAVAILABLE',
        });
    });

});
