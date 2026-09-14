import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { probeCodexAppServerExecutionRunAvailability } from './probeCodexAppServerExecutionRunAvailability';

describe('probeCodexAppServerExecutionRunAvailability', () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    for (const path of tempPaths.splice(0)) {
      try {
        chmodSync(path, 0o755);
      } catch {
        // ignore cleanup
      }
    }
  });

  it('rejects a directory override path', () => {
    const dir = join(tmpdir(), `happier-codex-appserver-probe-dir-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    expect(probeCodexAppServerExecutionRunAvailability({ env: { HAPPIER_CODEX_APP_SERVER_BIN: dir } as NodeJS.ProcessEnv })).toBe(false);
  });

  it('rejects a non-executable file override path', () => {
    const file = join(tmpdir(), `happier-codex-appserver-probe-file-${Date.now()}`);
    writeFileSync(file, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(file, 0o644);
    tempPaths.push(file);
    expect(probeCodexAppServerExecutionRunAvailability({ env: { HAPPIER_CODEX_APP_SERVER_BIN: file } as NodeJS.ProcessEnv })).toBe(false);
  });

  it('rejects a codex CLI that exists but does not support the app-server subcommand', () => {
    const dir = join(tmpdir(), `happier-codex-appserver-probe-bin-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const codex = join(dir, 'codex');
    writeFileSync(
      codex,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  echo "codex 0.77.0"',
        '  exit 0',
        'fi',
        'if [ "$1" = "app-server" ]; then',
        '  echo "unknown command: app-server" >&2',
        '  exit 2',
        'fi',
        'exit 0',
      ].join('\n'),
      'utf8',
    );
    chmodSync(codex, 0o755);
    tempPaths.push(codex);

    expect(probeCodexAppServerExecutionRunAvailability({
      env: { PATH: dir } as NodeJS.ProcessEnv,
    })).toBe(false);
  });

  it('probes the command string from provider CLI resolution results', () => {
    const dir = join(tmpdir(), `happier-codex-appserver-probe-resolution-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const codex = join(dir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
    writeFileSync(
      codex,
      process.platform === 'win32'
        ? '@echo off\r\nif "%~1"=="app-server" if "%~2"=="--help" exit /b 0\r\nexit /b 2\r\n'
        : [
            '#!/bin/sh',
            'if [ "$1" = "--version" ]; then',
            '  echo "codex 0.121.0"',
            '  exit 0',
            'fi',
            'if [ "$1" = "app-server" ] && [ "$2" = "--help" ]; then',
            '  echo "app-server help"',
            '  exit 0',
            'fi',
            'exit 2',
          ].join('\n'),
      'utf8',
    );
    if (process.platform !== 'win32') chmodSync(codex, 0o755);
    tempPaths.push(codex);

    expect(probeCodexAppServerExecutionRunAvailability({
      env: { PATH: dir, HAPPIER_CODEX_PATH: codex } as NodeJS.ProcessEnv,
    })).toBe(true);
  });

  it('does not treat a TUI shim as the app-server command when the dedicated override is absent', () => {
    const dir = join(tmpdir(), `happier-codex-appserver-probe-tui-shim-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const extension = process.platform === 'win32' ? '.cmd' : '';
    const tuiShim = join(dir, `codex-tui${extension}`);
    const nativeCodex = join(dir, `codex-native${extension}`);
    const script = process.platform === 'win32'
      ? '@echo off\r\nexit /b 2\r\n'
      : '#!/bin/sh\nexit 2\n';
    const successScript = process.platform === 'win32'
      ? '@echo off\r\nexit /b 0\r\n'
      : '#!/bin/sh\nexit 0\n';
    writeFileSync(tuiShim, script, 'utf8');
    writeFileSync(nativeCodex, successScript, 'utf8');
    if (process.platform !== 'win32') {
      chmodSync(tuiShim, 0o755);
      chmodSync(nativeCodex, 0o755);
    }
    tempPaths.push(tuiShim, nativeCodex);

    expect(probeCodexAppServerExecutionRunAvailability({
      env: {
        ...process.env,
        KAIWU_CODEX_APP_SERVER_BIN: undefined,
        HAPPIER_CODEX_APP_SERVER_BIN: undefined,
        HAPPIER_CODEX_TUI_BIN: tuiShim,
        HAPPY_CODEX_TUI_BIN: undefined,
        HAPPIER_CODEX_PATH: nativeCodex,
      } as NodeJS.ProcessEnv,
    })).toBe(true);
  });

  it('expands ~ in override env vars before probing the app-server command', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'happier-codex-appserver-probe-home-'));
    try {
      const homeDir = join(root, 'home');
      const binDir = join(homeDir, 'bin');
      mkdirSync(binDir, { recursive: true });
      const codex = join(binDir, 'codex-app-server');
      writeFileSync(
        codex,
        [
          '#!/bin/sh',
          'if [ "$1" = "app-server" ] && [ "$2" = "--help" ]; then',
          '  exit 0',
          'fi',
          'exit 2',
        ].join('\n'),
        'utf8',
      );
      chmodSync(codex, 0o755);
      tempPaths.push(codex);

      expect(probeCodexAppServerExecutionRunAvailability({
        env: {
          HOME: homeDir,
          HAPPIER_CODEX_APP_SERVER_BIN: '~/bin/codex-app-server',
          HAPPIER_CODEX_APP_SERVER_PROBE_TIMEOUT_MS: '5000',
        } as NodeJS.ProcessEnv,
      })).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves relative override paths against the provided cwd before probing', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'happier-codex-appserver-probe-cwd-'));
    try {
      const cwd = join(root, 'project');
      const binDir = join(cwd, 'bin');
      mkdirSync(binDir, { recursive: true });
      const codex = join(binDir, 'codex-app-server');
      writeFileSync(
        codex,
        [
          '#!/bin/sh',
          'if [ "$1" = "app-server" ] && [ "$2" = "--help" ]; then',
          '  exit 0',
          'fi',
          'exit 2',
        ].join('\n'),
        'utf8',
      );
      chmodSync(codex, 0o755);
      tempPaths.push(codex);

      expect(probeCodexAppServerExecutionRunAvailability({
        cwd,
        env: {
          HAPPIER_CODEX_APP_SERVER_BIN: './bin/codex-app-server',
        } as NodeJS.ProcessEnv,
      })).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
