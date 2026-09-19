import type { RpcHandlerRegistrar } from '@/api/rpc/types';
import { configuration } from '@/configuration';

import { registerReadFileHandler } from './readFileHandler';
import { registerWriteFileHandler } from './writeFileHandler';
import { registerDirectoryHandlers } from './directoryHandlers';
import { registerPathMutationHandlers } from './pathMutationHandlers';
import { registerOpenInEditorHandler } from './openInEditorHandler';
import { registerSessionTransferRpcHandlers } from '@/transfers/rpc/registerSessionTransferRpcHandlers';
import { resolveSessionRpcTransferMaxBytes } from '@/transfers/policy/sessionRpcTransferPolicy';
import { createTransferPathAllowanceRegistry } from '@/transfers/targets/createTransferPathAllowanceRegistry';
import { TransferSessionStore } from '@/transfers/core/transferSessionStore';
import {
  type FilesystemAccessPolicy,
  resolveFilesystemPolicyDefaultDirectory,
} from './accessPolicy/filesystemAccessPolicy';

function normalizeAllowedDirectories(getDirectories?: () => ReadonlyArray<string>): string[] {
  const value = getDirectories?.() ?? [];
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function registerFileSystemHandlers(
  rpcHandlerManager: RpcHandlerRegistrar,
  workingDirectory: string,
  opts?: Readonly<{
    accessPolicy?: FilesystemAccessPolicy;
    getAdditionalAllowedReadDirs?: () => ReadonlyArray<string>;
    getAdditionalAllowedWriteDirs?: () => ReadonlyArray<string>;
  }>,
): Readonly<{
  transferSessionStore: TransferSessionStore;
  dispose: () => Promise<void>;
}> {
  const accessPolicy: FilesystemAccessPolicy = opts?.accessPolicy ?? { kind: 'osUser' };
  const effectiveWorkingDirectory = resolveFilesystemPolicyDefaultDirectory({
    defaultDirectory: workingDirectory,
    accessPolicy,
  });
  const getAdditionalAllowedReadDirs = opts?.getAdditionalAllowedReadDirs;
  const getAdditionalAllowedWriteDirs = opts?.getAdditionalAllowedWriteDirs;
  const pathAllowanceRegistry = createTransferPathAllowanceRegistry({
    onReadDirsChange: () => {},
    onWriteDirsChange: () => {},
  });
  const transferSessionStore = new TransferSessionStore({ ttlMs: configuration.filesTransferSessionTtlMs });

  registerReadFileHandler(rpcHandlerManager, {
    defaultDirectory: effectiveWorkingDirectory,
    accessPolicy,
    getAdditionalAllowedReadDirs: () => normalizeAllowedDirectories(getAdditionalAllowedReadDirs),
  });
  registerWriteFileHandler(rpcHandlerManager, {
    defaultDirectory: effectiveWorkingDirectory,
    accessPolicy,
    getAdditionalAllowedWriteDirs: () => normalizeAllowedDirectories(getAdditionalAllowedWriteDirs),
  });
  registerDirectoryHandlers(rpcHandlerManager, {
    defaultDirectory: effectiveWorkingDirectory,
    accessPolicy,
    getAdditionalAllowedReadDirs: () => normalizeAllowedDirectories(getAdditionalAllowedReadDirs),
    getAdditionalAllowedWriteDirs: () => normalizeAllowedDirectories(getAdditionalAllowedWriteDirs),
  });
  registerPathMutationHandlers(rpcHandlerManager, {
    defaultDirectory: effectiveWorkingDirectory,
    accessPolicy,
    getAdditionalAllowedReadDirs: () => normalizeAllowedDirectories(getAdditionalAllowedReadDirs),
    getAdditionalAllowedWriteDirs: () => normalizeAllowedDirectories(getAdditionalAllowedWriteDirs),
  });
  registerOpenInEditorHandler(rpcHandlerManager, {
    defaultDirectory: effectiveWorkingDirectory,
    accessPolicy,
    getAdditionalAllowedReadDirs: () => normalizeAllowedDirectories(getAdditionalAllowedReadDirs),
  });
  registerSessionTransferRpcHandlers(rpcHandlerManager, {
    workingDirectory: effectiveWorkingDirectory,
    accessPolicy,
    store: transferSessionStore,
    getAdditionalAllowedReadDirs,
    getAdditionalAllowedWriteDirs,
    sessionRpcTransferMaxBytes: resolveSessionRpcTransferMaxBytes(),
    attachmentUpload: {
      pathAllowanceRegistry,
    },
  });

  return {
    transferSessionStore,
    dispose: () => transferSessionStore.dispose(),
  };
}
