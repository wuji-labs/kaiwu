import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeToolCall, makeToolViewProps, renderScreen } from '@/dev/testkit';
import { SendFileView } from './SendFileView';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockPushSessionFileDeepLink = vi.fn();
vi.mock('@/utils/url/sessionFileDeepLink', async () => {
    const actual = await vi.importActual<any>('@/utils/url/sessionFileDeepLink');
    return {
        ...actual,
        pushSessionFileDeepLink: (...args: any[]) => mockPushSessionFileDeepLink(...args),
    };
});

const mockStartDownload = vi.fn().mockResolvedValue({ ok: true });
let mockDownloadState = { status: 'idle' as const };

vi.mock('@/hooks/session/files/useWorkspaceFileTransfers', () => ({
    useWorkspaceFileTransfers: () => ({
        downloadState: mockDownloadState,
        startDownload: mockStartDownload,
        cancelDownload: vi.fn(),
        uploadState: { status: 'idle' },
        startUploads: vi.fn(),
        cancelUploads: vi.fn(),
    }),
}));

vi.mock('../../shell/presentation/ToolSectionView', () => ({
    ToolSectionView: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

describe('SendFileView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDownloadState = { status: 'idle' };
    });

    it('hides preview/download and shows the reason when the send was rejected', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: { path: '../secret.txt' },
            result: { ok: false, errorCode: 'access_denied', error: 'Access denied: path is outside the workspace' },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        expect(screen.getTextContent()).toContain('Access denied: path is outside the workspace');
        expect(screen.findByTestId('send-file-preview-button')).toBeNull();
        expect(screen.findByTestId('send-file-download-button')).toBeNull();
    });

    it('hides preview/download while the call is still running', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'running',
            input: { path: 'reports/summary.pdf' },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        expect(screen.getTextContent()).toContain('summary.pdf');
        expect(screen.findByTestId('send-file-preview-button')).toBeNull();
    });

    it('parses results delivered as MCP text content blocks', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: { path: 'out/logo.png' },
            result: [{ type: 'text', text: JSON.stringify({ ok: true, path: 'out/logo.png', fileName: 'logo.png', sizeBytes: 4096, mimeType: 'image/png' }) }],
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        expect(screen.getTextContent()).toContain('4.0 KB');
        expect(screen.findByTestId('send-file-download-button')).toBeTruthy();
    });

    it('renders with message, file name, and formatted size', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'reports/summary.pdf',
                message: 'Please review the generated quarterly report.',
            },
            result: {
                ok: true,
                path: 'reports/summary.pdf',
                fileName: 'summary.pdf',
                sizeBytes: 1048576, // 1 MB
                mimeType: 'application/pdf',
                message: 'Please review the generated quarterly report.',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        const rendered = screen.getTextContent();
        expect(rendered).toContain('summary.pdf');
        expect(rendered).toContain('1.0 MB');
        expect(rendered).toContain('Please review the generated quarterly report.');

        const messageEl = screen.findByTestId('send-file-message');
        expect(messageEl).toBeTruthy();
    });

    it('renders without message when message is not provided', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'data/output.csv',
            },
            result: {
                ok: true,
                path: 'data/output.csv',
                fileName: 'output.csv',
                sizeBytes: 2048, // 2 KB
                mimeType: 'text/csv',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        const rendered = screen.getTextContent();
        expect(rendered).toContain('output.csv');
        expect(rendered).toContain('2.0 KB');

        const messageEl = screen.findByTestId('send-file-message');
        expect(messageEl).toBeNull();
    });

    it('renders image files with image icon and proper metadata', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'images/architecture-diagram.png',
            },
            result: {
                ok: true,
                path: 'images/architecture-diagram.png',
                fileName: 'architecture-diagram.png',
                sizeBytes: 524288, // 512 KB
                mimeType: 'image/png',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        const rendered = screen.getTextContent();
        expect(rendered).toContain('architecture-diagram.png');
        expect(rendered).toContain('512 KB');

        const iconContainer = screen.findByTestId('send-file-icon');
        expect(iconContainer).toBeTruthy();
        const iconComponent = iconContainer?.findByProps({ name: 'image' });
        expect(iconComponent).toBeTruthy();
    });

    it('renders PDF files with file-text icon and proper metadata', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'docs/specification.pdf',
            },
            result: {
                ok: true,
                path: 'docs/specification.pdf',
                fileName: 'specification.pdf',
                sizeBytes: 2097152, // 2 MB
                mimeType: 'application/pdf',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-123' })),
        );

        const rendered = screen.getTextContent();
        expect(rendered).toContain('specification.pdf');
        expect(rendered).toContain('2.0 MB');

        const iconContainer = screen.findByTestId('send-file-icon');
        expect(iconContainer).toBeTruthy();
        const iconComponent = iconContainer?.findByProps({ name: 'file-text' });
        expect(iconComponent).toBeTruthy();
    });

    it('triggers preview deep link when preview button is clicked', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'docs/report.pdf',
            },
            result: {
                ok: true,
                path: 'docs/report.pdf',
                fileName: 'report.pdf',
                sizeBytes: 5000,
                mimeType: 'application/pdf',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-preview-1' })),
        );

        const previewButton = screen.findByTestId('send-file-preview-button');
        expect(previewButton).toBeTruthy();
        previewButton?.props.onPress();

        expect(mockPushSessionFileDeepLink).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                sessionId: 'sess-preview-1',
                filePath: 'docs/report.pdf',
            }),
        );
    });

    it('triggers file download when download button is clicked', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'build/bundle.zip',
            },
            result: {
                ok: true,
                path: 'build/bundle.zip',
                fileName: 'bundle.zip',
                sizeBytes: 8192,
                mimeType: 'application/zip',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { sessionId: 'sess-dl-1' })),
        );

        const downloadButton = screen.findByTestId('send-file-download-button');
        expect(downloadButton).toBeTruthy();
        await downloadButton?.props.onPress();

        expect(mockStartDownload).toHaveBeenCalledWith({
            path: 'build/bundle.zip',
            asZip: false,
        });
    });

    it('returns null when detailLevel is title', async () => {
        const tool = makeToolCall({
            name: 'send_file_to_user',
            state: 'completed',
            input: {
                path: 'notes.txt',
            },
            result: {
                ok: true,
                path: 'notes.txt',
                fileName: 'notes.txt',
                sizeBytes: 100,
                mimeType: 'text/plain',
            },
        });

        const screen = await renderScreen(
            React.createElement(SendFileView, makeToolViewProps(tool, { detailLevel: 'title' })),
        );

        expect(screen.getTextContent()).toBe('');
    });
});
