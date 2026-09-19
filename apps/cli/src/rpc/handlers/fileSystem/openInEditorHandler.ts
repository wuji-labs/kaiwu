import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname } from 'node:path';

import type { RpcHandlerRegistrar } from '@/api/rpc/types';
import { logger } from '@/ui/logger';
import { RPC_METHODS } from '@happier-dev/protocol/rpc';

import type { FilesystemAccessPolicy } from './accessPolicy/filesystemAccessPolicy';
import { authorizeFilesystemPath } from './accessPolicy/filesystemPathAuthorization';

export type OpenInEditorRequest = Readonly<{
  path: string;
  line?: number;
  column?: number;
  editor?: 'code' | 'cursor' | 'system';
}>;

export type OpenInEditorResponse =
  | Readonly<{ success: true; targetPath: string; editorUsed: string }>
  | Readonly<{ success: false; error: string }>;

function trySpawnDetached(command: string, args: readonly string[], cwd?: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        detached: true,
        stdio: 'ignore',
      });

      child.on('error', () => {
        resolve(false);
      });

      child.unref();
      // If error event hasn't fired in the next tick, assume spawn succeeded
      setImmediate(() => {
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function openInSystemFallback(targetPath: string, isDirectory: boolean): Promise<boolean> {
  const osPlatform = platform();
  return new Promise<boolean>((resolve) => {
    try {
      let cmd: string;
      let args: string[];

      if (osPlatform === 'win32') {
        cmd = 'explorer.exe';
        args = isDirectory ? [targetPath] : [`/select,${targetPath}`];
      } else if (osPlatform === 'darwin') {
        cmd = 'open';
        args = isDirectory ? [targetPath] : ['-R', targetPath];
      } else {
        cmd = 'xdg-open';
        args = [isDirectory ? targetPath : dirname(targetPath)];
      }

      const child = spawn(cmd, args, {
        windowsHide: true,
        shell: false,
        detached: true,
        stdio: 'ignore',
      });

      child.on('error', () => {
        resolve(false);
      });

      child.unref();
      setImmediate(() => {
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

export async function executeOpenInEditor(
  resolvedPath: string,
  options?: Readonly<{ line?: number; column?: number; editor?: 'code' | 'cursor' | 'system' }>,
): Promise<{ success: boolean; editorUsed: string; error?: string }> {
  let isDirectory = false;
  try {
    const stats = await stat(resolvedPath);
    isDirectory = stats.isDirectory();
  } catch {
    // If stat fails (e.g. missing file), we still allow attempting to open if desired
  }

  const requestedEditor = options?.editor;
  const line = options?.line && options.line > 0 ? Math.floor(options.line) : undefined;
  const column = options?.column && options.column > 0 ? Math.floor(options.column) : undefined;

  let gotoArg = resolvedPath;
  if (line !== undefined) {
    gotoArg += `:${line}`;
    if (column !== undefined) {
      gotoArg += `:${column}`;
    }
  }

  // Define editors to attempt in order of preference
  const candidateEditors: Array<{ name: string; cmd: string; args: string[] }> = [];

  if (requestedEditor === 'code') {
    candidateEditors.push({ name: 'code', cmd: 'code', args: ['--goto', gotoArg] });
  } else if (requestedEditor === 'cursor') {
    candidateEditors.push({ name: 'cursor', cmd: 'cursor', args: ['--goto', gotoArg] });
  } else if (requestedEditor === 'system') {
    // skip directly to system
  } else {
    // Default: try code, then cursor
    candidateEditors.push(
      { name: 'code', cmd: 'code', args: ['--goto', gotoArg] },
      { name: 'cursor', cmd: 'cursor', args: ['--goto', gotoArg] },
    );
  }

  for (const candidate of candidateEditors) {
    const spawned = await trySpawnDetached(candidate.cmd, candidate.args);
    if (spawned) {
      return { success: true, editorUsed: candidate.name };
    }
  }

  // Fallback to system explorer / file manager
  const systemOpened = await openInSystemFallback(resolvedPath, isDirectory);
  if (systemOpened) {
    return { success: true, editorUsed: 'system' };
  }

  return {
    success: false,
    editorUsed: 'none',
    error: 'Failed to launch editor (code/cursor) or system file manager on host',
  };
}

export function registerOpenInEditorHandler(
  rpcHandlerManager: RpcHandlerRegistrar,
  deps: Readonly<{
    defaultDirectory: string;
    accessPolicy: FilesystemAccessPolicy;
    getAdditionalAllowedReadDirs: () => ReadonlyArray<string>;
  }>,
): void {
  rpcHandlerManager.registerHandler<OpenInEditorRequest, OpenInEditorResponse>(
    RPC_METHODS.OPEN_IN_EDITOR,
    async (data) => {
      const rawPath = typeof data?.path === 'string' ? data.path : '';
      logger.debug('Open in editor request:', rawPath, data);

      if (!rawPath.trim()) {
        return { success: false, error: 'Path cannot be empty' };
      }

      const validation = authorizeFilesystemPath({
        targetPath: rawPath,
        defaultDirectory: deps.defaultDirectory,
        accessPolicy: deps.accessPolicy,
        additionalAllowedDirs: deps.getAdditionalAllowedReadDirs(),
      });

      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const result = await executeOpenInEditor(validation.resolvedPath, {
        line: typeof data?.line === 'number' ? data.line : undefined,
        column: typeof data?.column === 'number' ? data.column : undefined,
        editor: data?.editor,
      });

      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to open in editor' };
      }

      return {
        success: true,
        targetPath: validation.resolvedPath,
        editorUsed: result.editorUsed,
      };
    },
  );
}
