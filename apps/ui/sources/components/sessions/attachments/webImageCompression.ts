/**
 * Lightweight browser-side image downscaling for picked attachments.
 *
 * Web picks used to upload the raw camera/phone file (often several MB), while the native picker
 * already re-encodes. We only touch large, raster image files, never convert PNG/WebP to JPEG (which
 * would flatten transparency), and keep the original whenever re-encoding would not make it smaller.
 */
const WEB_IMAGE_COMPRESSION_THRESHOLD_BYTES = 1_500_000;
const WEB_IMAGE_MAX_EDGE_PX = 2048;
const WEB_IMAGE_ENCODE_QUALITY = 0.8;

const COMPRESSIBLE_WEB_IMAGE_TYPES: ReadonlySet<string> = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

function resolveWebImageOutputType(inputType: string): 'image/jpeg' | 'image/png' | 'image/webp' {
    const normalized = inputType.trim().toLowerCase();
    if (normalized === 'image/png') return 'image/png';
    if (normalized === 'image/webp') return 'image/webp';
    return 'image/jpeg';
}

export function shouldCompressPickedWebImage(file: Readonly<Pick<File, 'size' | 'type'>>): boolean {
    return file.size > WEB_IMAGE_COMPRESSION_THRESHOLD_BYTES
        && COMPRESSIBLE_WEB_IMAGE_TYPES.has(file.type.trim().toLowerCase());
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, type, WEB_IMAGE_ENCODE_QUALITY);
    });
}

async function reencodeWebImage(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file);
    try {
        const maxEdge = Math.max(bitmap.width, bitmap.height);
        if (!Number.isFinite(maxEdge) || maxEdge <= 0) return file;

        const scale = Math.min(1, WEB_IMAGE_MAX_EDGE_PX / maxEdge);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return file;
        context.drawImage(bitmap, 0, 0, width, height);

        const outputType = resolveWebImageOutputType(file.type);
        const blob = await canvasToBlob(canvas, outputType);
        // `toBlob` silently falls back to PNG for unsupported output types; do not relabel those
        // bytes as JPEG/WebP. Also keep the original when re-encoding did not actually shrink it.
        if (!blob || blob.type !== outputType || blob.size >= file.size) return file;
        return new File([blob], file.name, { type: outputType, lastModified: file.lastModified });
    } finally {
        bitmap.close?.();
    }
}

export async function compressPickedWebImageFile(file: File): Promise<File> {
    if (!shouldCompressPickedWebImage(file)) return file;
    try {
        return await reencodeWebImage(file);
    } catch {
        // Canvas / ImageBitmap support or decoding can fail (unsupported format, OOM); the raw file
        // remains a valid attachment, so fall back to it instead of failing the pick.
        return file;
    }
}