import * as React from 'react';

import { useSetting } from '@/sync/domains/state/storage';
import type { AttachmentsUploadConfig } from '@/sync/domains/transfers/ops/uploadSessionAttachment';

export const DEFAULT_ATTACHMENTS_UPLOAD_MAX_FILE_BYTES = 524288000;

// Earlier defaults (100 MB, 300 MB) were synced into account settings as explicit values,
// so they would silently pin the old cap after the default moved to 500 MB.
const LEGACY_DEFAULT_MAX_FILE_BYTES = new Set([100 * 1024 * 1024, 300 * 1024 * 1024]);

export function resolveAttachmentsUploadMaxFileBytes(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || LEGACY_DEFAULT_MAX_FILE_BYTES.has(value)) {
        return DEFAULT_ATTACHMENTS_UPLOAD_MAX_FILE_BYTES;
    }
    return Math.max(1024, Math.floor(value));
}

export function useAttachmentsUploadConfig(): AttachmentsUploadConfig {
    const attachmentsUploadsUploadLocation = useSetting('attachmentsUploadsUploadLocation');
    const attachmentsUploadsWorkspaceRelativeDir = useSetting('attachmentsUploadsWorkspaceRelativeDir');
    const attachmentsUploadsVcsIgnoreStrategy = useSetting('attachmentsUploadsVcsIgnoreStrategy');
    const attachmentsUploadsVcsIgnoreWritesEnabled = useSetting('attachmentsUploadsVcsIgnoreWritesEnabled');
    const attachmentsUploadsMaxFileBytes = useSetting('attachmentsUploadsMaxFileBytes');

    return React.useMemo(() => {
        const uploadLocation = attachmentsUploadsUploadLocation === 'os_temp' ? 'os_temp' : 'workspace';
        const workspaceRelativeDir =
            typeof attachmentsUploadsWorkspaceRelativeDir === 'string' && attachmentsUploadsWorkspaceRelativeDir.trim().length > 0
                ? attachmentsUploadsWorkspaceRelativeDir.trim()
                : '.kaiwu/uploads';
        const vcsIgnoreStrategy =
            attachmentsUploadsVcsIgnoreStrategy === 'gitignore' || attachmentsUploadsVcsIgnoreStrategy === 'none'
                ? attachmentsUploadsVcsIgnoreStrategy
                : 'git_info_exclude';
        const vcsIgnoreWritesEnabled = attachmentsUploadsVcsIgnoreWritesEnabled !== false;
        const maxFileBytes = resolveAttachmentsUploadMaxFileBytes(attachmentsUploadsMaxFileBytes);

        return {
            uploadLocation,
            workspaceRelativeDir,
            vcsIgnoreStrategy,
            vcsIgnoreWritesEnabled,
            maxFileBytes,
        };
    }, [
        attachmentsUploadsMaxFileBytes,
        attachmentsUploadsUploadLocation,
        attachmentsUploadsVcsIgnoreStrategy,
        attachmentsUploadsVcsIgnoreWritesEnabled,
        attachmentsUploadsWorkspaceRelativeDir,
    ]);
}
