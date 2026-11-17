import type { ImportedSessionHandoffBundle, SessionHandoffProviderBundle } from './types';

import { importClaudeSessionBundle } from '../../backends/claude/handoff/importClaudeSessionBundle';
import { importCodexSessionBundle } from '../../backends/codex/handoff/importCodexSessionBundle';

export async function importSessionHandoffProviderBundle(params: Readonly<{
  bundle: SessionHandoffProviderBundle;
  targetPath: string;
  sessionStorageMode?: 'direct' | 'persisted';
}>): Promise<ImportedSessionHandoffBundle> {
  switch (params.bundle.providerId) {
    case 'claude':
      return await importClaudeSessionBundle({
        bundle: params.bundle,
        targetPath: params.targetPath,
        env: process.env,
        sessionStorageMode: params.sessionStorageMode,
      });
    case 'codex':
      return await importCodexSessionBundle({
        bundle: params.bundle,
        targetPath: params.targetPath,
        env: process.env,
        sessionStorageMode: params.sessionStorageMode,
      });
  }
}
