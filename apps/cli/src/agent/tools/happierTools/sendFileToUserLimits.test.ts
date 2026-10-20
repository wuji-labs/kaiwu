import { mkdtempSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dispatchBuiltInHappierTool } from './dispatchBuiltInHappierTool';
import { DEFAULT_WEB_DOWNLOAD_MAX_BYTES, resolveWebDownloadMaxBytes } from './sendFileToUserLimits';

function unsupported() {
  return { ok: false, errorCode: 'unsupported', error: 'unsupported' } as const;
}

describe('sendFileToUser limits and boundary enforcement', () => {
  const originalEnv = { ...process.env };
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = mkdtempSync(join(tmpdir(), 'kaiwu-sendfile-limit-test-'));
    delete process.env.HAPPIER_WEB_DOWNLOAD_MAX_BYTES;
    delete process.env.HAPPIER_FILES_DOWNLOAD_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_HAPPIER_FILES_DOWNLOAD_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_HAPPY_FILES_DOWNLOAD_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_FILES_DOWNLOAD_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_HAPPIER_FILES_PREVIEW_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_HAPPY_FILES_PREVIEW_MAX_BYTES;
    delete process.env.EXPO_PUBLIC_FILES_PREVIEW_MAX_BYTES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    try {
      rmSync(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it('defaults DEFAULT_WEB_DOWNLOAD_MAX_BYTES and resolveWebDownloadMaxBytes() to 500 MB (524288000 bytes)', () => {
    expect(DEFAULT_WEB_DOWNLOAD_MAX_BYTES).toBe(500 * 1024 * 1024);
    expect(DEFAULT_WEB_DOWNLOAD_MAX_BYTES).toBe(524288000);
    expect(resolveWebDownloadMaxBytes()).toBe(524288000);
  });

  it('enforces 500 MB boundary in send_file_to_user: 524288000 passes, 524288001 is rejected', async () => {
    const fileAtLimit = join(testWorkspace, 'at-limit.bin');
    writeFileSync(fileAtLimit, '');
    truncateSync(fileAtLimit, 524288000);

    const fileOverLimit = join(testWorkspace, 'over-limit.bin');
    writeFileSync(fileOverLimit, '');
    truncateSync(fileOverLimit, 524288001);

    const resultAtLimit = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'at-limit.bin' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });
    expect(resultAtLimit.ok).toBe(true);
    if (resultAtLimit.ok) {
      expect(resultAtLimit.result).toMatchObject({
        sizeBytes: 524288000,
      });
    }

    const resultOverLimit = await dispatchBuiltInHappierTool({
      toolName: 'send_file_to_user',
      args: { path: 'over-limit.bin' },
      sessionId: 'sess-1',
      sessionDirectory: testWorkspace,
      deps: {
        changeTitle: async () => unsupported(),
        startExecutionRun: async () => unsupported(),
        executeActionByToolName: async () => unsupported(),
      },
    });
    expect(resultOverLimit.ok).toBe(false);
    if (!resultOverLimit.ok) {
      expect(resultOverLimit.errorCode).toBe('file_too_large');
      expect(resultOverLimit.error).toContain('524288000 bytes');
    }
  });
});
