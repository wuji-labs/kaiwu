import path from 'node:path';

const MIME_MAP: Record<string, string> = {
  '.js': 'application/javascript',
  '.hbc': 'application/javascript',
  '.bundle': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/m4a',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.html': 'text/html',
  '.css': 'text/css',
  '.txt': 'text/plain',
};

export function getMimeType(filePathOrExt: string): string {
  const ext = filePathOrExt.startsWith('.')
    ? filePathOrExt.toLowerCase()
    : path.extname(filePathOrExt).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}
