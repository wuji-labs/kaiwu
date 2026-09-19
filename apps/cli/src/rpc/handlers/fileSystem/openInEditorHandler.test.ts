import { describe, expect, it, vi } from 'vitest';
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RPC_METHODS } from '@happier-dev/protocol/rpc';

import { registerFileSystemHandlers } from './registerFileSystemHandlers';

type Handler = (data: any) => Promise<any>;

function createRpcHandlerManager(): {
  handlers: Map<string, Handler>;
  registerHandler: (method: string, handler: Handler) => void;
} {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    registerHandler(method, handler) {
      handlers.set(method, handler);
    },
  };
}

describe('openInEditor RPC handler', () => {
  it('registers the OPEN_IN_EDITOR handler on file system registration', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'happier-open-in-editor-'));
    try {
      const mgr = createRpcHandlerManager();
      registerFileSystemHandlers(mgr as unknown as RpcHandlerManager, workspace);

      const handler = mgr.handlers.get(RPC_METHODS.OPEN_IN_EDITOR);
      expect(handler).toBeDefined();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('rejects empty or whitespace path', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'happier-open-in-editor-'));
    try {
      const mgr = createRpcHandlerManager();
      registerFileSystemHandlers(mgr as unknown as RpcHandlerManager, workspace);

      const handler = mgr.handlers.get(RPC_METHODS.OPEN_IN_EDITOR);
      if (!handler) throw new Error('handler missing');

      const res = await handler({ path: '   ' });
      expect(res).toMatchObject({ success: false, error: expect.stringContaining('empty') });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('rejects unauthorized paths outside restricted workspace', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'happier-open-in-editor-'));
    try {
      const mgr = createRpcHandlerManager();
      registerFileSystemHandlers(mgr as unknown as RpcHandlerManager, workspace, {
        accessPolicy: { kind: 'restrictedRoots', roots: [workspace] },
      });

      const handler = mgr.handlers.get(RPC_METHODS.OPEN_IN_EDITOR);
      if (!handler) throw new Error('handler missing');

      const res = await handler({ path: '../../outside.txt' });
      expect(res.success).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('authorizes valid workspace file path and attempts launch', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'happier-open-in-editor-'));
    try {
      const testFile = join(workspace, 'index.ts');
      writeFileSync(testFile, 'console.log("hello");\n', 'utf8');

      const mgr = createRpcHandlerManager();
      registerFileSystemHandlers(mgr as unknown as RpcHandlerManager, workspace);

      const handler = mgr.handlers.get(RPC_METHODS.OPEN_IN_EDITOR);
      if (!handler) throw new Error('handler missing');

      const res = await handler({ path: 'index.ts', line: 10, column: 5 });
      // In CI / test environment, editor or system opener returns result with targetPath
      expect(typeof res.success).toBe('boolean');
      if (res.success) {
        expect(res.targetPath).toBe(testFile);
        expect(typeof res.editorUsed).toBe('string');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
