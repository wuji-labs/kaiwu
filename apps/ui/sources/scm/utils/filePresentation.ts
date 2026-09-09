const KNOWN_BINARY_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'ico',
    'mp4',
    'avi',
    'mov',
    'wmv',
    'flv',
    'webm',
    'm4v',
    'mp3',
    'wav',
    'm4a',
    'aac',
    'flac',
    'ogg',
    'opus',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'zip',
    'tar',
    'gz',
    'rar',
    '7z',
    'exe',
    'dmg',
    'deb',
    'rpm',
    'woff',
    'woff2',
    'ttf',
    'otf',
    'db',
    'sqlite',
    'sqlite3',
    'lockb',
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
};

function getPathExtension(path: string): string | null {
    const basename = path.split('/').pop() ?? path;
    const lastDotIndex = basename.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex >= basename.length - 1) return null;
    return basename.slice(lastDotIndex + 1).toLowerCase();
}

export type MediaKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'audio' | 'video';
export type LegacyOfficeKind = 'doc' | 'xls' | 'ppt';

const MEDIA_KIND_BY_EXTENSION: Record<string, MediaKind> = {
    pdf: 'pdf',
    docx: 'docx',
    xlsx: 'xlsx',
    pptx: 'pptx',
    mp3: 'audio',
    wav: 'audio',
    m4a: 'audio',
    aac: 'audio',
    flac: 'audio',
    ogg: 'audio',
    opus: 'audio',
    mp4: 'video',
    mov: 'video',
    webm: 'video',
    m4v: 'video',
};

const LEGACY_OFFICE_KIND_BY_EXTENSION: Record<string, LegacyOfficeKind> = {
    doc: 'doc',
    xls: 'xls',
    ppt: 'ppt',
};

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
};

export function getMediaMimeTypeFromPath(path: string): string | null {
    const extension = getPathExtension(path);
    if (!extension) return null;
    return MEDIA_MIME_BY_EXTENSION[extension] ?? null;
}

export function getMediaKind(path: string): MediaKind | null {
    const extension = getPathExtension(path);
    if (!extension) return null;
    return MEDIA_KIND_BY_EXTENSION[extension] ?? null;
}

export function getLegacyOfficeKind(path: string): LegacyOfficeKind | null {
    const extension = getPathExtension(path);
    if (!extension) return null;
    return LEGACY_OFFICE_KIND_BY_EXTENSION[extension] ?? null;
}

export function isKnownBinaryPath(path: string): boolean {
    const extension = getPathExtension(path);
    return extension ? KNOWN_BINARY_EXTENSIONS.has(extension) : false;
}

export function getImageMimeTypeFromPath(path: string): string | null {
    const extension = getPathExtension(path);
    if (!extension) return null;
    return IMAGE_MIME_BY_EXTENSION[extension] ?? null;
}

export function isKnownImagePath(path: string): boolean {
    return getImageMimeTypeFromPath(path) != null;
}

export function isBinaryContent(content: string): boolean {
    if (!content) return false;
    if (content.includes('\0')) return true;

    const len = content.length;
    if (len === 0) return false;
    const maxAllowed = Math.floor(len * 0.1);

    let nonPrintableCount = 0;
    for (let i = 0; i < len; i++) {
        const code = content.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            nonPrintableCount += 1;
            if (nonPrintableCount > maxAllowed) return true;
        }
    }

    return false;
}
