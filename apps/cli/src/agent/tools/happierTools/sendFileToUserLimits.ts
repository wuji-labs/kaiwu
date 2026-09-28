export const DEFAULT_WEB_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : undefined;
}

export function resolveWebDownloadMaxBytes(): number {
  return (
    parseOptionalPositiveInt(process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.HAPPIER_FILES_DOWNLOAD_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_HAPPIER_FILES_DOWNLOAD_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_HAPPY_FILES_DOWNLOAD_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_FILES_DOWNLOAD_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_HAPPIER_FILES_PREVIEW_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_HAPPY_FILES_PREVIEW_MAX_BYTES)
    ?? parseOptionalPositiveInt(process.env.EXPO_PUBLIC_FILES_PREVIEW_MAX_BYTES)
    ?? DEFAULT_WEB_DOWNLOAD_MAX_BYTES
  );
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.mts': 'text/typescript',
  '.cts': 'text/typescript',
  '.py': 'text/x-python',
  '.sh': 'text/x-sh',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export function inferFileMimeType(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  if (match && match[0] in MIME_BY_EXTENSION) {
    return MIME_BY_EXTENSION[match[0]];
  }
  return 'application/octet-stream';
}
