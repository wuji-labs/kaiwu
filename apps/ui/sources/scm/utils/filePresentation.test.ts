import { describe, expect, it } from 'vitest';

import { getFileLanguageFromPath } from '@/utils/code/fileLanguage';
import {
    getLegacyOfficeKind,
    getMediaKind,
    getMediaMimeTypeFromPath,
    isBinaryContent,
    isKnownBinaryPath,
} from './filePresentation';

describe('getFileLanguageFromPath', () => {
    it('maps known file extensions to syntax highlighter languages', () => {
        expect(getFileLanguageFromPath('src/example.ts')).toBe('typescript');
        expect(getFileLanguageFromPath('src/example.md')).toBe('markdown');
        expect(getFileLanguageFromPath('src/example.sh')).toBe('bash');
        expect(getFileLanguageFromPath('src/example.rs')).toBe('rust');
        expect(getFileLanguageFromPath('assets/icon.svg')).toBe('xml');
        expect(getFileLanguageFromPath('src/header.h')).toBe('c');
        expect(getFileLanguageFromPath('src/component.vue')).toBe('vue');
        expect(getFileLanguageFromPath('src/schema.graphql')).toBe('graphql');
        expect(getFileLanguageFromPath('src/schema.gql')).toBe('graphql');
    });

    it('maps known special filenames to syntax highlighter languages', () => {
        expect(getFileLanguageFromPath('Dockerfile')).toBe('dockerfile');
        expect(getFileLanguageFromPath('Makefile')).toBe('makefile');
        expect(getFileLanguageFromPath('CMakeLists.txt')).toBe('cmake');
        expect(getFileLanguageFromPath('.editorconfig')).toBe('ini');
        expect(getFileLanguageFromPath('.gitconfig')).toBe('ini');
        expect(getFileLanguageFromPath('.npmrc')).toBe('ini');
        expect(getFileLanguageFromPath('.prettierrc')).toBe('json');
        expect(getFileLanguageFromPath('.bashrc')).toBe('bash');
        expect(getFileLanguageFromPath('.zshrc')).toBe('zsh');
        expect(getFileLanguageFromPath('.env')).toBe('dotenv');
        expect(getFileLanguageFromPath('.env.production')).toBe('dotenv');
        expect(getFileLanguageFromPath('.gitignore')).toBe('text');
        expect(getFileLanguageFromPath('CODEOWNERS')).toBe('codeowners');
        expect(getFileLanguageFromPath('tsconfig.json')).toBe('jsonc');
    });

    it('recognizes special path-based config files', () => {
        expect(getFileLanguageFromPath('/home/me/.ssh/config')).toBe('ssh-config');
    });

    it('returns null for unknown extensions', () => {
        expect(getFileLanguageFromPath('src/example.unknown')).toBeNull();
        expect(getFileLanguageFromPath('src/no-extension')).toBeNull();
    });
});

describe('isKnownBinaryPath', () => {
    it('detects binary file extensions', () => {
        expect(isKnownBinaryPath('assets/logo.png')).toBe(true);
        expect(isKnownBinaryPath('build/app.exe')).toBe(true);
        expect(isKnownBinaryPath('src/app.ts')).toBe(false);
        expect(isKnownBinaryPath('assets/icon.svg')).toBe(false);
    });
});

describe('isBinaryContent', () => {
    it('detects NUL bytes', () => {
        expect(isBinaryContent('text\0binary')).toBe(true);
    });

    it('detects high non-printable character ratios', () => {
        const mostlyBinary = `abcdef${String.fromCharCode(1)}${String.fromCharCode(2)}`;
        expect(isBinaryContent(mostlyBinary)).toBe(true);
    });

    it('allows plain text including whitespace controls', () => {
        expect(isBinaryContent('line 1\nline 2\tline 3\r\n')).toBe(false);
    });
});

describe('getMediaKind', () => {
    it('maps all required media extensions correctly', () => {
        // PDF
        expect(getMediaKind('doc.pdf')).toBe('pdf');
        expect(getMediaKind('UPPERCASE.PDF')).toBe('pdf');
        expect(getMediaKind('nested/path/to/file.pdf')).toBe('pdf');

        // Office modern
        expect(getMediaKind('document.docx')).toBe('docx');
        expect(getMediaKind('sheet.xlsx')).toBe('xlsx');
        expect(getMediaKind('slides.pptx')).toBe('pptx');

        // Audio
        expect(getMediaKind('track.mp3')).toBe('audio');
        expect(getMediaKind('sound.wav')).toBe('audio');
        expect(getMediaKind('song.m4a')).toBe('audio');
        expect(getMediaKind('audio.aac')).toBe('audio');
        expect(getMediaKind('lossless.flac')).toBe('audio');
        expect(getMediaKind('recording.ogg')).toBe('audio');
        expect(getMediaKind('voice.opus')).toBe('audio');

        // Video
        expect(getMediaKind('movie.mp4')).toBe('video');
        expect(getMediaKind('clip.mov')).toBe('video');
        expect(getMediaKind('stream.webm')).toBe('video');
        expect(getMediaKind('capture.m4v')).toBe('video');
    });

    it('returns null for non-media files or legacy office formats or csv', () => {
        // Legacy office (not handled by getMediaKind)
        expect(getMediaKind('legacy.doc')).toBeNull();
        expect(getMediaKind('legacy.xls')).toBeNull();
        expect(getMediaKind('legacy.ppt')).toBeNull();

        // CSV remains text
        expect(getMediaKind('data.csv')).toBeNull();

        // Code and plain text
        expect(getMediaKind('index.ts')).toBeNull();
        expect(getMediaKind('readme.md')).toBeNull();
        expect(getMediaKind('package.json')).toBeNull();
        expect(getMediaKind('file-without-extension')).toBeNull();
    });
});

describe('getLegacyOfficeKind', () => {
    it('identifies legacy office formats for guidance', () => {
        expect(getLegacyOfficeKind('old.doc')).toBe('doc');
        expect(getLegacyOfficeKind('PATH/TO/OLD.XLS')).toBe('xls');
        expect(getLegacyOfficeKind('presentation.ppt')).toBe('ppt');
    });

    it('returns null for modern office or other files', () => {
        expect(getLegacyOfficeKind('modern.docx')).toBeNull();
        expect(getLegacyOfficeKind('modern.xlsx')).toBeNull();
        expect(getLegacyOfficeKind('modern.pptx')).toBeNull();
        expect(getLegacyOfficeKind('data.csv')).toBeNull();
        expect(getLegacyOfficeKind('text.txt')).toBeNull();
    });
});

describe('getMediaMimeTypeFromPath', () => {
    it('returns correct mime types for media kinds', () => {
        expect(getMediaMimeTypeFromPath('file.pdf')).toBe('application/pdf');
        expect(getMediaMimeTypeFromPath('file.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(getMediaMimeTypeFromPath('file.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(getMediaMimeTypeFromPath('file.pptx')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
        expect(getMediaMimeTypeFromPath('file.mp3')).toBe('audio/mpeg');
        expect(getMediaMimeTypeFromPath('file.mp4')).toBe('video/mp4');
    });

    it('returns null for unknown extensions', () => {
        expect(getMediaMimeTypeFromPath('file.txt')).toBeNull();
        expect(getMediaMimeTypeFromPath('file.unknown')).toBeNull();
    });
});


