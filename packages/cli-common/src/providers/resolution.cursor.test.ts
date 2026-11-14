import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProviderCliCommand } from './resolution.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'happier-cursor-cli-resolution-'));
  tempDirs.push(dir);
  return dir;
}

// Windows paths are case-insensitive and PATHEXT lookup may report e.g. `.CMD` for an on-disk `.cmd`.
function normalizeResolvedCommand<T extends { command: string } | null>(resolved: T): T {
  if (!resolved || process.platform !== 'win32') return resolved;
  return { ...resolved, command: resolved.command.toLowerCase() };
}

function writeExecutable(dir: string, name: string, scriptBody = 'exit 0'): string {
  const path = join(dir, process.platform === 'win32' ? `${name}.cmd` : name);
  writeFileSync(
    path,
    process.platform === 'win32'
      ? `@echo off\r\n${scriptBody}\r\n`
      : `#!/bin/sh\n${scriptBody}\n`,
    'utf8',
  );
  if (process.platform !== 'win32') {
    chmodSync(path, 0o755);
  }
  return path;
}

describe('Cursor provider CLI resolution', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers cursor-agent when both Cursor binary names are on PATH', () => {
    const binDir = makeTempDir();
    writeExecutable(binDir, 'agent');
    const cursorAgent = writeExecutable(binDir, 'cursor-agent');

    expect(normalizeResolvedCommand(resolveProviderCliCommand('cursor', {
      processEnv: { ...process.env, PATH: binDir, HOME: binDir },
    }))).toEqual(normalizeResolvedCommand({ source: 'system', command: cursorAgent }));
  });

  it('falls back to agent when cursor-agent is unavailable', () => {
    const binDir = makeTempDir();
    const agent = writeExecutable(binDir, 'agent', process.platform === 'win32' ? 'echo {"cliVersion":"2026.05.24-test"}\r\nexit /b 0' : 'echo \'{"cliVersion":"2026.05.24-test"}\'');

    expect(normalizeResolvedCommand(resolveProviderCliCommand('cursor', {
      processEnv: { ...process.env, PATH: binDir, HOME: binDir },
    }))).toEqual(normalizeResolvedCommand({ source: 'system', command: agent }));
  });

  it('honors Cursor settings that disable the generic agent fallback binary', () => {
    const binDir = makeTempDir();
    writeExecutable(binDir, 'agent', process.platform === 'win32' ? 'echo {"cliVersion":"2026.05.24-test"}\r\nexit /b 0' : 'echo \'{"cliVersion":"2026.05.24-test"}\'');

    expect(resolveProviderCliCommand('cursor', {
      processEnv: {
        ...process.env,
        PATH: binDir,
        HOME: binDir,
        HAPPIER_CURSOR_AGENT_FALLBACK_ENABLED: '0',
      },
    })).toBeNull();
  });

  it('ignores a bare agent command that does not identify as Cursor', () => {
    const binDir = makeTempDir();
    writeExecutable(binDir, 'agent', process.platform === 'win32' ? 'echo not cursor\r\nexit /b 0' : 'echo not cursor');

    expect(resolveProviderCliCommand('cursor', {
      processEnv: { ...process.env, PATH: binDir, HOME: binDir },
    })).toBeNull();
  });

  it('returns relative Cursor path overrides as absolute commands so provider subprocess cwd changes do not break launches', () => {
    const binDir = makeTempDir();
    const cursorAgent = writeExecutable(binDir, 'cursor-agent');
    const relativeCursorAgent = relative(process.cwd(), cursorAgent);

    expect(resolveProviderCliCommand('cursor', {
      processEnv: {
        ...process.env,
        HAPPIER_CURSOR_PATH: relativeCursorAgent,
        PATH: '',
        HOME: binDir,
      },
    })).toEqual({ source: 'override', command: cursorAgent });
  });
});
