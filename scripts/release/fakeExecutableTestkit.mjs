// @ts-check

/**
 * Shared helpers for release/pipeline contract tests that inject fake CLIs (gh, git, docker, yarn, ...)
 * on PATH, plus explicit capability probes for tests that genuinely need POSIX-only tooling.
 *
 * Fake CLIs are written as shebang scripts (`#!/bin/sh`, `#!/usr/bin/env bash`, `#!/usr/bin/env node`).
 * POSIX executes them directly. Windows cannot execute extensionless files, so on win32 every stub also
 * gets a sibling `<name>.cmd` wrapper that runs the stub through its interpreter (Git for Windows bash
 * for shell stubs, the current Node binary for node stubs). Scripts under test resolve commands with
 * PATHEXT (see scripts/pipeline/lib/portable-child-process.mjs), so the wrapper is what they execute.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const isWindows = process.platform === 'win32';

/** @type {string | null | undefined} */
let cachedWindowsBash;

/**
 * Locate a POSIX shell usable for running shell stubs on Windows: `KAIWU_TEST_POSIX_SHELL`, else the
 * Git for Windows `bin\bash.exe` launcher (it puts `/usr/bin` coreutils on PATH, unlike usr\bin\bash.exe
 * and unlike the WSL `System32\bash.exe`, which cannot see Windows paths).
 * @returns {string | null}
 */
export function resolveWindowsPosixShell() {
  if (!isWindows) return null;
  if (cachedWindowsBash !== undefined) return cachedWindowsBash;
  const override = String(process.env.KAIWU_TEST_POSIX_SHELL ?? '').trim();
  if (override && existsSync(override)) return (cachedWindowsBash = override);
  const candidates = [];
  const execPath = spawnSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true });
  const gitExecPath = String(execPath.stdout ?? '').trim();
  if (execPath.status === 0 && gitExecPath) {
    // <GitRoot>/mingw64/libexec/git-core -> <GitRoot>/bin/bash.exe
    candidates.push(join(resolve(gitExecPath, '..', '..', '..'), 'bin', 'bash.exe'));
  }
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (root) candidates.push(join(root, 'Git', 'bin', 'bash.exe'));
  }
  cachedWindowsBash = candidates.find((candidate) => existsSync(candidate)) ?? null;
  return cachedWindowsBash;
}

/**
 * @param {string} source
 * @returns {'node' | 'shell' | null}
 */
function shebangKind(source) {
  const firstLine = String(source).split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.startsWith('#!')) return null;
  if (/\bnode\b/.test(firstLine)) return 'node';
  if (/\b(ba|da|z)?sh\b/.test(firstLine)) return 'shell';
  return null;
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {string | null} cmd wrapper content, or null when no wrapper is needed/possible
 */
function buildWindowsWrapper(filePath, source) {
  const kind = shebangKind(source);
  if (!kind) return null;
  const interpreter = kind === 'node' ? process.execPath : resolveWindowsPosixShell();
  if (!interpreter) {
    throw new Error(
      `fake executable ${filePath} needs a POSIX shell on Windows; install Git for Windows or set KAIWU_TEST_POSIX_SHELL`,
    );
  }
  const target = basename(filePath);
  return [
    '@echo off',
    'setlocal',
    // MSYS runtime would otherwise glob-expand unquoted `*` arguments before the stub sees them.
    'set "MSYS=noglob %MSYS%"',
    `"${interpreter}" "%~dp0${target}" %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');
}

/**
 * Add (or refresh) the Windows `.cmd` wrapper for an existing shebang stub. No-op on POSIX.
 * @param {string} filePath
 */
export function ensureWindowsExecutableWrapper(filePath) {
  if (!isWindows) return;
  const source = readFileSync(filePath, 'utf8');
  const wrapper = buildWindowsWrapper(filePath, source);
  if (wrapper) writeFileSync(`${filePath}.cmd`, wrapper, 'utf8');
}

/**
 * Write a fake executable (shebang script) and make it runnable on every platform.
 * @param {string} filePath
 * @param {string} source
 * @param {{ mode?: number }} [options]
 */
export function writeFakeExecutable(filePath, source, options = {}) {
  const mode = options.mode ?? 0o755;
  writeFileSync(filePath, source, { encoding: 'utf8', mode });
  chmodSync(filePath, mode);
  if (isWindows) {
    const wrapper = buildWindowsWrapper(filePath, source);
    if (wrapper) writeFileSync(`${filePath}.cmd`, wrapper, 'utf8');
  }
}

/**
 * Async variant of {@link writeFakeExecutable}.
 * @param {string} filePath
 * @param {string} source
 * @param {{ mode?: number }} [options]
 */
export async function writeFakeExecutableAsync(filePath, source, options = {}) {
  const mode = options.mode ?? 0o755;
  await writeFile(filePath, source, { encoding: 'utf8', mode });
  await chmod(filePath, mode);
  if (isWindows) {
    const wrapper = buildWindowsWrapper(filePath, source);
    if (wrapper) await writeFile(`${filePath}.cmd`, wrapper, 'utf8');
  }
}

/**
 * Command + args to run a shell script file (`bash script.sh ...`) portably: on Windows uses the Git
 * for Windows bash launcher instead of whatever `bash` resolves first (often WSL's System32\bash.exe).
 * @param {string[]} args
 * @returns {{ command: string; args: string[] }}
 */
export function bashInvocation(args) {
  if (!isWindows) return { command: 'bash', args };
  const shell = resolveWindowsPosixShell();
  if (!shell) throw new Error('bash is required: install Git for Windows or set KAIWU_TEST_POSIX_SHELL');
  return { command: shell, args };
}

/** @type {Map<string, boolean>} */
const commandProbeCache = new Map();

/**
 * True when `command` is resolvable and runnable (`command --version`/`-v` style probe not required:
 * we only check resolvability through the platform's own lookup).
 * @param {string} command
 */
export function hasCommand(command) {
  const cached = commandProbeCache.get(command);
  if (cached !== undefined) return cached;
  const probe = isWindows
    ? spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true })
    : spawnSync('sh', ['-c', `command -v ${JSON.stringify(command)}`], { encoding: 'utf8' });
  const ok = probe.status === 0 && String(probe.stdout ?? '').trim().length > 0;
  commandProbeCache.set(command, ok);
  return ok;
}

/**
 * Returns a skip reason (string) when the host cannot run a test that needs a POSIX host (a POSIX
 * kernel/userland: `uname -s` reports Linux or Darwin), or `false` when it can. MSYS/Git Bash and
 * Cygwin report MINGW/MSYS/CYGWIN and lack POSIX permission/symlink/pty semantics.
 * @param {string} why what the test needs the POSIX host for (included in the skip reason)
 * @returns {string | false}
 */
export function skipUnlessPosixHost(why) {
  if (cachedPosixHostOs === undefined) {
    const uname = spawnSync('uname', ['-s'], { encoding: 'utf8', windowsHide: true });
    cachedPosixHostOs = uname.status === 0 ? String(uname.stdout ?? '').trim() : '';
  }
  if (!isWindows && (cachedPosixHostOs === 'Linux' || cachedPosixHostOs === 'Darwin')) return false;
  return `requires a POSIX host (uname -s = Linux/Darwin; here ${process.platform}${cachedPosixHostOs ? `/${cachedPosixHostOs}` : ''}): ${why}`;
}

/** @type {string | undefined} */
let cachedPosixHostOs;

/**
 * Returns a skip reason when `command` is not available on this host, or `false` when it is.
 * @param {string} command
 * @param {string} why
 * @returns {string | false}
 */
export function skipUnlessCommand(command, why) {
  return hasCommand(command) ? false : `requires \`${command}\` on PATH: ${why}`;
}

/** @type {boolean | undefined} */
let cachedSymlinkCapability;

/**
 * Returns a skip reason when this process cannot create file symlinks (Windows without Developer Mode
 * or SeCreateSymbolicLinkPrivilege returns EPERM), or `false` when it can.
 * @param {string} why
 * @returns {string | false}
 */
export function skipUnlessSymlinks(why) {
  if (cachedSymlinkCapability === undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'kaiwu-symlink-probe-'));
    try {
      writeFileSync(join(dir, 'target'), 'x');
      symlinkSync(join(dir, 'target'), join(dir, 'link'), 'file');
      cachedSymlinkCapability = true;
    } catch {
      cachedSymlinkCapability = false;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return cachedSymlinkCapability
    ? false
    : `requires permission to create symlinks (EPERM here; enable Windows Developer Mode or grant SeCreateSymbolicLinkPrivilege): ${why}`;
}
