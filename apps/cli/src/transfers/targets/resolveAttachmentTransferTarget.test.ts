import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  resolveAttachmentTransferTarget,
  resolveConfiguredAttachmentTransferTarget,
} from './resolveAttachmentTransferTarget';
import { resolveConfiguredSessionMediaTransferTarget } from '../sessionMedia/resolveSessionMediaTransferTarget';

describe('resolveAttachmentTransferTarget', () => {
  it('keeps workspace uploads inside the workspace transfer substrate', () => {
    expect(resolveConfiguredAttachmentTransferTarget({
      config: {
        uploadLocation: 'workspace',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      },
      tempUploadRoot: '/tmp/happier/uploads/session-1',
      workingDirectory: '/repo',
    })).toEqual({
      success: true,
      target: resolveAttachmentTransferTarget({
        uploadLocation: 'workspace',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      }, '/tmp/happier/uploads/session-1'),
      uploadBasePath: '.happier/uploads/messages',
    });
  });

  it('rejects workspace uploads outside restricted filesystem roots', () => {
    const result = resolveConfiguredAttachmentTransferTarget({
      config: {
        uploadLocation: 'workspace',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      },
      tempUploadRoot: '/tmp/happier/uploads/session-1',
      workingDirectory: '/repo',
      accessPolicy: { kind: 'restrictedRoots', roots: ['/allowed'] },
    });

    expect(result).toEqual({
      success: false,
      target: resolveAttachmentTransferTarget({
        uploadLocation: 'workspace',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      }, '/tmp/happier/uploads/session-1'),
      error: expect.stringContaining('Access denied'),
    });
  });

  it('keeps os_temp uploads inside the configured temp transfer root', () => {
    const tempUploadRoot = join('/tmp/happier/uploads', 'session-2');
    const uploadBasePath = join(tempUploadRoot, 'messages');
    const result = resolveConfiguredAttachmentTransferTarget({
      config: {
        uploadLocation: 'os_temp',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'none',
        vcsIgnoreWritesEnabled: false,
      },
      tempUploadRoot,
      workingDirectory: '/repo',
    });

    expect(result).toEqual({
      success: true,
      target: {
        uploadBasePath,
        additionalAllowedReadDirs: [tempUploadRoot],
        additionalAllowedWriteDirs: [tempUploadRoot],
      },
      uploadBasePath,
    });
  });

  it('resolves generated media into the workspace generated media directory', () => {
    expect(resolveConfiguredSessionMediaTransferTarget({
      category: 'generated',
      config: {
        uploadLocation: 'workspace',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      },
      tempUploadRoot: '/tmp/happier/uploads/session-3',
      workingDirectory: '/repo',
    })).toEqual({
      success: true,
      target: {
        uploadBasePath: '.happier/uploads/generated',
        additionalAllowedReadDirs: [],
        additionalAllowedWriteDirs: [],
      },
      uploadBasePath: '.happier/uploads/generated',
    });
  });

  it('resolves artifact media into the workspace artifacts media directory', () => {
    expect(resolveConfiguredSessionMediaTransferTarget({
      category: 'artifacts',
      config: {
        uploadLocation: 'workspace',
        workspaceRelativeDir: ' .happier\\uploads ',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      },
      tempUploadRoot: '/tmp/happier/uploads/session-4',
      workingDirectory: '/repo',
    })).toEqual({
      success: true,
      target: {
        uploadBasePath: '.happier/uploads/artifacts',
        additionalAllowedReadDirs: [],
        additionalAllowedWriteDirs: [],
      },
      uploadBasePath: '.happier/uploads/artifacts',
    });
  });

  it('rejects Windows drive-root workspace media directories', () => {
    expect(resolveConfiguredSessionMediaTransferTarget({
      category: 'generated',
      config: {
        uploadLocation: 'workspace',
        workspaceRelativeDir: 'C:\\Users\\alice\\.happier\\uploads',
        vcsIgnoreStrategy: 'git_info_exclude',
        vcsIgnoreWritesEnabled: true,
      },
      tempUploadRoot: '/tmp/happier/uploads/session-windows',
      workingDirectory: '/repo',
    })).toMatchObject({
      success: false,
      error: 'Invalid workspaceRelativeDir',
    });
  });

  it('rejects os_temp storage for durable generated media categories', () => {
    const tempUploadRoot = join('/tmp/happier/uploads', 'session-5');
    const uploadBasePath = join(tempUploadRoot, 'generated');
    expect(resolveConfiguredSessionMediaTransferTarget({
      category: 'generated',
      config: {
        uploadLocation: 'os_temp',
        workspaceRelativeDir: '.happier/uploads',
        vcsIgnoreStrategy: 'none',
        vcsIgnoreWritesEnabled: false,
      },
      tempUploadRoot,
      workingDirectory: '/repo',
    })).toEqual({
      success: false,
      target: {
        uploadBasePath,
        additionalAllowedReadDirs: [tempUploadRoot],
        additionalAllowedWriteDirs: [tempUploadRoot],
      },
      error: 'Session media category generated must use workspace storage',
    });
  });
});
