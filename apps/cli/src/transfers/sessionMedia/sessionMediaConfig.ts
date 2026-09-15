export type SessionMediaUploadLocation = 'workspace' | 'os_temp';
export type SessionMediaVcsIgnoreStrategy = 'git_info_exclude' | 'gitignore' | 'none';

export type SessionMediaTransferConfig = Readonly<{
    uploadLocation: SessionMediaUploadLocation;
    workspaceRelativeDir: string;
    vcsIgnoreStrategy: SessionMediaVcsIgnoreStrategy;
    vcsIgnoreWritesEnabled: boolean;
}>;

export const DEFAULT_SESSION_MEDIA_TRANSFER_CONFIG: SessionMediaTransferConfig = {
    uploadLocation: 'workspace',
    workspaceRelativeDir: '.kaiwu/uploads',
    vcsIgnoreStrategy: 'git_info_exclude',
    vcsIgnoreWritesEnabled: true,
};

export function normalizeSessionMediaUploadLocation(value: unknown): SessionMediaUploadLocation | null {
    if (value === 'workspace' || value === 'os_temp') return value;
    return null;
}

export function normalizeSessionMediaVcsIgnoreStrategy(value: unknown): SessionMediaVcsIgnoreStrategy | null {
    if (value === 'git_info_exclude' || value === 'gitignore' || value === 'none') return value;
    return null;
}

export function normalizeSessionMediaWorkspaceRelativeDir(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
    if (/^[a-zA-Z]:/.test(trimmed)) return null;
    const parts = trimmed.split(/[\\/]+/g).filter(Boolean);
    if (parts.some((part) => part === '.' || part === '..')) return null;
    return parts.join('/');
}
