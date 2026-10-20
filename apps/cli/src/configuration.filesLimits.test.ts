import { mkdtempSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configuration, reloadConfiguration } from './configuration';
import { resolveWorkspaceFileDownloadSource } from './transfers/targets/resolveWorkspaceFileDownloadSource';
import { resolveWorkspaceFileUploadTarget } from './transfers/targets/resolveWorkspaceFileUploadTarget';

describe('configuration files limits', () => {
  const originalEnv = { ...process.env };
  const createdPaths = new Set<string>();

  function createWorkspace(): string {
    const workspace = mkdtempSync(join(tmpdir(), 'kaiwu-cfg-limits-test-'));
    createdPaths.add(workspace);
    return workspace;
  }

  beforeEach(() => {
    delete process.env.HAPPIER_FILES_UPLOAD_MAX_FILE_BYTES;
    delete process.env.HAPPIER_FILES_DOWNLOAD_MAX_FILE_BYTES;
    delete process.env.HAPPIER_FILES_ZIP_MAX_TOTAL_BYTES;
    delete process.env.HAPPIER_FILES_TRANSFER_SESSION_TTL_MS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    reloadConfiguration();
    for (const path of createdPaths) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {}
    }
    createdPaths.clear();
  });

  it('defaults upload and download limits to 500 MB (524288000 bytes) and transfer TTL to 60 minutes', () => {
    reloadConfiguration();
    expect(configuration.filesUploadMaxFileBytes).toBe(500 * 1024 * 1024);
    expect(configuration.filesUploadMaxFileBytes).toBe(524288000);
    expect(configuration.filesDownloadMaxFileBytes).toBe(500 * 1024 * 1024);
    expect(configuration.filesDownloadMaxFileBytes).toBe(524288000);
    expect(configuration.filesZipMaxTotalBytes).toBe(100 * 1024 * 1024);
    expect(configuration.filesTransferSessionTtlMs).toBe(60 * 60_000);
  });

  it('enforces 500 MB boundary for upload: 524288000 passes, 524288001 is rejected', () => {
    reloadConfiguration();
    const workspace = createWorkspace();

    const passResult = resolveWorkspaceFileUploadTarget({
      workingDirectory: workspace,
      path: 'upload.bin',
      sizeBytes: 524288000,
      overwrite: false,
    });
    expect(passResult.success).toBe(true);

    const failResult = resolveWorkspaceFileUploadTarget({
      workingDirectory: workspace,
      path: 'upload.bin',
      sizeBytes: 524288001,
      overwrite: false,
    });
    expect(failResult.success).toBe(false);
    if (!failResult.success) {
      expect(failResult.error).toBe('File exceeds upload size limit');
    }
  });

  it('enforces 500 MB boundary for download: 524288000 passes, 524288001 is rejected', async () => {
    reloadConfiguration();
    const workspace = createWorkspace();

    const fileAtLimit = join(workspace, 'download-at-limit.bin');
    writeFileSync(fileAtLimit, '');
    truncateSync(fileAtLimit, 524288000);

    const passResult = await resolveWorkspaceFileDownloadSource({
      workingDirectory: workspace,
      path: 'download-at-limit.bin',
      asZip: false,
    });
    expect(passResult.success).toBe(true);

    const fileOverLimit = join(workspace, 'download-over-limit.bin');
    writeFileSync(fileOverLimit, '');
    truncateSync(fileOverLimit, 524288001);

    const failResult = await resolveWorkspaceFileDownloadSource({
      workingDirectory: workspace,
      path: 'download-over-limit.bin',
      asZip: false,
    });
    expect(failResult.success).toBe(false);
    if (!failResult.success) {
      expect(failResult.error).toBe('File exceeds download size limit');
    }
  });

  it('respects environment variable overrides', () => {
    process.env.HAPPIER_FILES_UPLOAD_MAX_FILE_BYTES = '600000000';
    process.env.HAPPIER_FILES_DOWNLOAD_MAX_FILE_BYTES = '600000000';
    process.env.HAPPIER_FILES_ZIP_MAX_TOTAL_BYTES = '600000000';
    process.env.HAPPIER_FILES_TRANSFER_SESSION_TTL_MS = '2400000';

    reloadConfiguration();
    expect(configuration.filesUploadMaxFileBytes).toBe(600000000);
    expect(configuration.filesDownloadMaxFileBytes).toBe(600000000);
    expect(configuration.filesZipMaxTotalBytes).toBe(600000000);
    expect(configuration.filesTransferSessionTtlMs).toBe(2400000);
  });
});
