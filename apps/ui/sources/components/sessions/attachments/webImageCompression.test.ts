import { afterEach, describe, expect, it, vi } from 'vitest';

import { compressPickedWebImageFile, shouldCompressPickedWebImage } from './webImageCompression';

function createImageFile(name: string, type: string, size = 2_000_000): File {
    return new File([new Uint8Array(size)], name, { type });
}

function stubImagePipeline(options: Readonly<{
    width: number;
    height: number;
    encodedSize?: number;
    encodedType?: string;
}>): Readonly<{ canvasSizes: Array<{ width: number; height: number }>; createImageBitmapSpy: ReturnType<typeof vi.fn> }> {
    const canvasSizes: Array<{ width: number; height: number }> = [];
    const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, type?: string) => {
            canvasSizes.push({ width: fakeCanvas.width, height: fakeCanvas.height });
            const outputType = options.encodedType ?? type ?? 'image/png';
            callback(new Blob([new Uint8Array(options.encodedSize ?? 100_000)], { type: outputType }));
        },
    };
    // Canvas/ImageBitmap are real browser boundaries; this test stubs the platform, not the module.
    vi.stubGlobal('document', { createElement: vi.fn(() => fakeCanvas) });
    const createImageBitmapSpy = vi.fn(async () => ({
        width: options.width,
        height: options.height,
        close: vi.fn(),
    }));
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);
    return { canvasSizes, createImageBitmapSpy };
}

describe('webImageCompression', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('leaves small images and non-image files untouched', async () => {
        const small = createImageFile('small.jpg', 'image/jpeg', 100_000);
        const largeDoc = createImageFile('scan.pdf', 'application/pdf', 5_000_000);
        const largeZip = createImageFile('archive.zip', 'application/zip', 5_000_000);

        expect(shouldCompressPickedWebImage(small)).toBe(false);
        expect(shouldCompressPickedWebImage(largeDoc)).toBe(false);
        expect(shouldCompressPickedWebImage(largeZip)).toBe(false);
        await expect(compressPickedWebImageFile(small)).resolves.toBe(small);
        await expect(compressPickedWebImageFile(largeDoc)).resolves.toBe(largeDoc);
    });

    it('downscales a large JPEG to the bounded edge and keeps the file name', async () => {
        const { canvasSizes } = stubImagePipeline({ width: 4000, height: 3000 });
        const file = createImageFile('photo.jpg', 'image/jpeg');

        const compressed = await compressPickedWebImageFile(file);

        expect(compressed).not.toBe(file);
        expect(compressed.name).toBe('photo.jpg');
        expect(compressed.type).toBe('image/jpeg');
        expect(compressed.size).toBeLessThan(file.size);
        expect(canvasSizes).toEqual([{ width: 2048, height: 1536 }]);
    });

    it('keeps PNG output as PNG so transparency survives re-encoding', async () => {
        stubImagePipeline({ width: 1000, height: 1000 });
        const file = createImageFile('diagram.png', 'image/png');

        const compressed = await compressPickedWebImageFile(file);

        expect(compressed.type).toBe('image/png');
        expect(compressed.size).toBeLessThan(file.size);
    });

    it('keeps the original bytes when the browser cannot produce the requested format', async () => {
        // e.g. a browser without WebP encoding support silently falls back to PNG.
        stubImagePipeline({ width: 3000, height: 3000, encodedType: 'image/png' });
        const file = createImageFile('photo.webp', 'image/webp');

        await expect(compressPickedWebImageFile(file)).resolves.toBe(file);
    });

    it('falls back to the original file when decoding or encoding fails', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => {
            throw new Error('decode failed');
        }));
        const file = createImageFile('broken.jpg', 'image/jpeg');

        await expect(compressPickedWebImageFile(file)).resolves.toBe(file);
    });
});