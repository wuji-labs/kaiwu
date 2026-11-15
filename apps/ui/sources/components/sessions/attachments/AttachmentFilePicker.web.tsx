import * as React from 'react';

import type { AttachmentFilePickerHandle, AttachmentFilePickerProps, PickedAttachment } from './AttachmentFilePicker.types';
import { compressPickedWebImageFile } from './webImageCompression';

export const AttachmentFilePicker = React.forwardRef<AttachmentFilePickerHandle, AttachmentFilePickerProps>(
    function AttachmentFilePicker(props, ref) {
        const inputRef = React.useRef<HTMLInputElement | null>(null);

        const openFiles = React.useCallback(() => {
            if (inputRef.current) {
                inputRef.current.accept = '';
                inputRef.current.click();
            }
        }, []);

        const openImages = React.useCallback(() => {
            if (inputRef.current) {
                inputRef.current.accept = 'image/*';
                inputRef.current.click();
            }
        }, []);

        React.useImperativeHandle(ref, () => ({
            open: openFiles,
            openFiles,
            openImages,
        }), [openFiles, openImages]);

        return (
            <input
                ref={inputRef}
                type="file"
                style={{ display: 'none' }}
                multiple={props.multiple !== false}
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    // Reset immediately so picking the same file again still triggers onChange.
                    e.target.value = '';
                    if (files.length === 0) return;

                    void Promise.all(files.map((file) => compressPickedWebImageFile(file)))
                        .then((pickedFiles) => {
                            const picked: PickedAttachment[] = pickedFiles.map((file) => ({ kind: 'web', file }));
                            props.onAttachmentsPicked(picked);
                        });
                }}
            />
        );
    }
);
