import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dispatchBuiltInHappierTool } from './dispatchBuiltInHappierTool';
import type { HappierBuiltInToolDispatchResult } from './types';

function unsupported(): HappierBuiltInToolDispatchResult {
  return { ok: false, errorCode: 'unsupported', error: 'unsupported' };
}

describe('dispatchBuiltInHappierTool - send_file_to_user', () => {
  let testWorkspace: string;
  let outsideWorkspace: string;

  beforeEach(() => {
    testWorkspace = mkdtempSync(join(tmpdir(), 'kaiwu-sendfile-ws-'));
    outsideWorkspace = mkdtempSync(join(tmpdir(), 'kaiwu-sendfile-out-'));
  });

  afterEach(() => {
    try {
      rmSync(testWorkspace, { recursive: true, force: true });
    } catch {}
    try {
      rmSync(outsideWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it('successfully delivers an existing file with message and metadata', async () => {
    const reportsDir = join(testWorkspace, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const filePath = join(reportsDir, 'summary.pdf');
    writeFileSync(filePath, 'PDF-mock-content-bytes-1234');

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'reports/summary.pdf', message: 'Here is the summary report' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result).toEqual({
      ok: true,
      path: 'reports/summary.pdf',
      fileName: 'summary.pdf',
      sizeBytes: 27,
      mimeType: 'application/pdf',
      message: 'Here is the summary report',
    });
  });

  it('delivers an image file without message with proper MIME inference', async () => {
    const imgPath = join(testWorkspace, 'diagram.png');
    writeFileSync(imgPath, Buffer.alloc(100));

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'diagram.png' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result).toEqual({
      ok: true,
      path: 'diagram.png',
      fileName: 'diagram.png',
      sizeBytes: 100,
      mimeType: 'image/png',
    });
  });

  it('rejects missing files with file_not_found', async () => {
    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'does_not_exist.txt' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'file_not_found',
    });
    expect(result.ok ? '' : result.error).toContain('does_not_exist.txt');
  });

  it('rejects directories with is_directory', async () => {
    const subDir = join(testWorkspace, 'subfolder');
    mkdirSync(subDir, { recursive: true });

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'subfolder' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'is_directory',
    });
    expect(result.ok ? '' : result.error).toContain('directory');
  });

  it('rejects path traversal attempting to escape workspace with access_denied', async () => {
    const outsideFile = join(outsideWorkspace, 'secret.txt');
    writeFileSync(outsideFile, 'secret-content');

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: '../outside/secret.txt' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'access_denied',
    });
  });

  it('rejects absolute paths outside the workspace with access_denied', async () => {
    const outsideFile = join(outsideWorkspace, 'external.txt');
    writeFileSync(outsideFile, 'outside');

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: outsideFile },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'access_denied',
    });
  });

  it('rejects symlink escapes pointing outside workspace with access_denied', async () => {
    const outsideFile = join(outsideWorkspace, 'target.txt');
    writeFileSync(outsideFile, 'target');

    const symlinkDir = join(testWorkspace, 'linked_dir');
    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      symlinkSync(outsideWorkspace, symlinkDir, symlinkType);
    } catch {
      // If OS environment does not permit symlink/junction creation, skip gracefully
      return;
    }

    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'linked_dir/target.txt' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'access_denied',
    });
  });

  it('rejects Windows reserved device names with access_denied', async () => {
    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'nul' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      platform: 'win32',
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'access_denied',
    });
    expect(result.ok ? '' : result.error).toContain('reserved Windows device name');
  });

  it('rejects cross-drive paths on Windows with access_denied', async () => {
    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'D:\\other_drive\\data.csv' },
      sessionId: 'sess-1',
      sessionDirectory: 'C:\\workspace',
      platform: 'win32',
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'access_denied',
    });
    expect(result.ok ? '' : result.error).toContain('outside the allowed directories');
  });

  it('rejects files exceeding maximum allowed download size with file_too_large', async () => {
    const largeFilePath = join(testWorkspace, 'large.bin');
    writeFileSync(largeFilePath, 'mock');

    const originalEnv = process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES;
    try {
      process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES = '2'; // limit to 2 bytes

      const result = await dispatchBuiltInHappierTool({
        toolName: 'send_file_to_user',
        args: { path: 'large.bin' },
        sessionId: 'sess-1',
        sessionDirectory: testWorkspace,
        deps: {
          changeTitle: async () => unsupported(),
          startExecutionRun: async () => unsupported(),
          executeActionByToolName: async () => unsupported(),
        },
      });

      expect(result).toMatchObject({
        ok: false,
        errorCode: 'file_too_large',
      });
      expect(result.ok ? '' : result.error).toContain('exceeds maximum allowed download size');
    } finally {
      if (originalEnv !== undefined) {
        process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES = originalEnv;
      } else {
        delete process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES;
      }
    }
  });

  it('rejects invalid payload when path is missing with invalid_action_input', async () => {
    const result = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { message: 'no path provided' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'invalid_action_input',
    });
  });

  it('fails closed when the session workspace directory is unknown', async () => {
    writeFileSync(join(process.cwd(), '.kaiwu-sendfile-probe.tmp'), 'x');
    try {
      const result = await dispatchBuiltInHappierTool({
        toolName: 'send_file_to_user',
        args: { path: '.kaiwu-sendfile-probe.tmp' },
        sessionId: 'sess-1',
        deps: {
          changeTitle: async () => unsupported(),
          startExecutionRun: async () => unsupported(),
          executeActionByToolName: async () => unsupported(),
          resolveSessionDirectory: () => null,
        },
      });

      expect(result).toMatchObject({
        ok: false,
        errorCode: 'session_directory_unavailable',
      });
    } finally {
      rmSync(join(process.cwd(), '.kaiwu-sendfile-probe.tmp'), { force: true });
    }
  });
});
