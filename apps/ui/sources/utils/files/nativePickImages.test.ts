import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeImagePickerModule = vi.hoisted(() => ({
    current: { launchImageLibraryAsync: () => undefined } as unknown,
}));

vi.mock('expo-image-picker', () => ({
    launchImageLibraryAsync: vi.fn(async () => ({ canceled: true })),
    MediaTypeOptions: { Images: 'images' },
}));

vi.mock('expo-modules-core', () => ({
    requireOptionalNativeModule: vi.fn(() => nativeImagePickerModule.current),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

describe('nativePickImages', () => {
    beforeEach(async () => {
        nativeImagePickerModule.current = { launchImageLibraryAsync: () => undefined };
        const ImagePicker = await import('expo-image-picker');
        vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
        vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
    });

    it('returns web File sources when expo-image-picker provides `asset.file`', async () => {
        const ImagePicker = await import('expo-image-picker');
        const file = new File([new Uint8Array([7, 8, 9])], 'photo.png', { type: 'image/png' });

        vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
            canceled: false,
            assets: [
                {
                    uri: 'blob://fake',
                    fileName: 'photo.png',
                    fileSize: file.size,
                    width: 100,
                    height: 100,
                    mimeType: 'image/png',
                    file,
                },
            ],
        });

        const { nativePickImages } = await import('./nativePickImages');
        const picked = await nativePickImages({ multiple: false });

        expect(picked).toEqual([{ kind: 'web', file }]);
    });

    it('asks the picker to compress picked photos before upload', async () => {
        const ImagePicker = await import('expo-image-picker');
        vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });

        const { nativePickImages } = await import('./nativePickImages');
        await nativePickImages({ multiple: true });

        const launchParams = vi.mocked(ImagePicker.launchImageLibraryAsync).mock.calls[0]?.[0] as
            | { quality?: number }
            | undefined;
        expect(launchParams?.quality).toBeGreaterThan(0);
        expect(launchParams?.quality).toBeLessThan(1);
    });

    it('returns no files when the native image picker module is unavailable', async () => {
        nativeImagePickerModule.current = null;
        const ImagePicker = await import('expo-image-picker');
        vi.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(
            new Error("Cannot find native module 'ExponentImagePicker'"),
        );

        const { nativePickImages } = await import('./nativePickImages');
        const picked = await nativePickImages({ multiple: true });

        expect(picked).toEqual([]);
        expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    });
});
