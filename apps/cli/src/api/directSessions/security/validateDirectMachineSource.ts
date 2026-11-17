import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DirectSessionsProviderId, DirectSessionsSource } from '@happier-dev/protocol';
import { expandHomeDirPath } from '@happier-dev/cli-common/providers';

import {
  resolveConfiguredClaudeConfigDir,
} from '@/backends/claude/directSessions/resolveClaudeConfigDir';

type DirectSourceValidationResult =
  | Readonly<{ ok: true; source: DirectSessionsSource }>
  | Readonly<{ ok: false; error: string }>;

function err(error: string): DirectSourceValidationResult {
  return { ok: false, error };
}

function canonicalizePath(raw: string, env: NodeJS.ProcessEnv): string {
  const resolved = resolve(expandHomeDirPath(raw.trim(), env));
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isSafeConnectedServiceId(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value);
}

export function validateDirectMachineSource(params: Readonly<{
  providerId: DirectSessionsProviderId;
  source: DirectSessionsSource;
  env: NodeJS.ProcessEnv;
}>): DirectSourceValidationResult {
  const { providerId, source, env } = params;

  switch (providerId) {
    case 'codex': {
      if (source.kind !== 'codexHome') return err('provider/source mismatch');
      if (source.home === 'connectedService' && !isSafeConnectedServiceId(source.connectedServiceId)) {
        return err('invalid connectedServiceId');
      }
      return { ok: true, source };
    }
    case 'claude': {
      if (source.kind !== 'claudeConfig') return err('provider/source mismatch');
      const requestedConfigDir =
        typeof source.configDir === 'string' && source.configDir.trim().length > 0
          ? canonicalizePath(source.configDir, env)
          : null;
      const configuredConfigDir = canonicalizePath(resolveConfiguredClaudeConfigDir({ env }), env);
      if (requestedConfigDir && requestedConfigDir !== configuredConfigDir) {
        return err('source configDir override is not allowed');
      }
      return {
        ok: true,
        source: {
          ...source,
          configDir: configuredConfigDir,
        },
      };
    }
    default: {
      return err('unsupported direct session provider');
    }
  }
}
