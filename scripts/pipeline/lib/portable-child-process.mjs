// @ts-check

/**
 * Drop-in replacement for the `node:child_process` spawn family used by pipeline/release scripts.
 *
 * POSIX: every export is the untouched Node implementation (zero behaviour change).
 *
 * Windows: Node/libuv only resolves bare command names to `.exe`/`.com`, so spawning `yarn`, `npx`,
 * `eas`, `npm` (all `.cmd` shims on Windows) fails with ENOENT, and PATH-injected `.cmd` wrappers are
 * silently bypassed in favour of whatever `.exe` appears later on PATH. Here bare command names are
 * resolved against the *child's* PATH using PATHEXT (standard Windows semantics), and `.cmd`/`.bat`
 * targets are invoked through an explicitly escaped `cmd.exe /d /s /c` command line so argument
 * boundaries survive. Calls that already pass `shell` are left alone.
 */

import * as nodeChildProcess from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter as pathDelimiter, join } from 'node:path';
import { promisify } from 'node:util';

import { resolveWindowsCommandInvocation } from './windows/resolveWindowsCommandInvocation.mjs';

export * from 'node:child_process';

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 */
function readEnvCaseInsensitive(env, name) {
  const wanted = name.toLowerCase();
  // Windows env blocks are case-insensitive; when duplicates exist, Node uses the lexicographically
  // first key (e.g. `PATH` wins over `Path`), so mirror that ordering.
  const keys = Object.keys(env).filter((k) => k.toLowerCase() === wanted).sort();
  return keys.length > 0 ? String(env[keys[0]] ?? '') : '';
}

/**
 * Resolve a bare command name on PATH using PATHEXT only (never an extensionless file: CreateProcess
 * cannot execute those and Windows itself would not pick them).
 *
 * @param {string} command
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
export function resolveWindowsExecutableOnPath(command, env = process.env) {
  const cmd = String(command ?? '').trim();
  if (!cmd || /[\\/:]/.test(cmd)) return null;
  const pathext = (readEnvCaseInsensitive(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
  const lowered = cmd.toLowerCase();
  const candidates = pathext.some((ext) => lowered.endsWith(ext.toLowerCase()))
    ? [cmd]
    : pathext.map((ext) => `${cmd}${ext.toLowerCase()}`);
  for (const dir of readEnvCaseInsensitive(env, 'PATH').split(pathDelimiter)) {
    const trimmed = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!trimmed) continue;
    for (const name of candidates) {
      const full = join(trimmed, name);
      try {
        if (existsSync(full) && statSync(full).isFile()) return full;
      } catch {
        // ignore unreadable PATH entries
      }
    }
  }
  return null;
}

/**
 * @param {string} command
 * @param {ReadonlyArray<string>} args
 * @param {any} options
 * @returns {{ command: string; args: string[]; options: any }}
 */
export function resolvePortableInvocation(command, args, options) {
  const argList = Array.isArray(args) ? args.map((a) => String(a)) : [];
  if (process.platform !== 'win32' || (options && options.shell)) {
    return { command, args: argList, options };
  }
  const env = (options && options.env) || process.env;
  const resolved = resolveWindowsExecutableOnPath(command, env) ?? command;
  if (!/\.(cmd|bat)$/i.test(resolved)) {
    return { command: resolved, args: argList, options };
  }
  const invocation = resolveWindowsCommandInvocation({
    command: resolved,
    args: argList,
    env,
    resolveCommandOnPath: false,
  });
  return {
    command: invocation.command,
    args: invocation.args,
    options: { ...(options ?? {}), windowsVerbatimArguments: invocation.windowsVerbatimArguments === true },
  };
}

/**
 * Normalise the (file, args?, options?) overloads shared by spawn/spawnSync/execFile/execFileSync.
 * @param {IArguments | any[]} raw
 */
function splitArgs(raw) {
  const all = Array.from(raw);
  const [file, maybeArgs, ...rest] = all;
  if (Array.isArray(maybeArgs)) return { file, args: maybeArgs, rest };
  if (maybeArgs === undefined || maybeArgs === null) return { file, args: [], rest };
  return { file, args: [], rest: [maybeArgs, ...rest] };
}

/** @type {typeof nodeChildProcess.spawn} */
// @ts-ignore -- overloads are forwarded verbatim
export function spawn(...raw) {
  const { file, args, rest } = splitArgs(raw);
  const [options, ...tail] = rest;
  const inv = resolvePortableInvocation(file, args, options);
  // @ts-ignore
  return nodeChildProcess.spawn(inv.command, inv.args, inv.options, ...tail);
}

/** @type {typeof nodeChildProcess.spawnSync} */
// @ts-ignore -- overloads are forwarded verbatim
export function spawnSync(...raw) {
  const { file, args, rest } = splitArgs(raw);
  const [options, ...tail] = rest;
  const inv = resolvePortableInvocation(file, args, options);
  // @ts-ignore
  return nodeChildProcess.spawnSync(inv.command, inv.args, inv.options, ...tail);
}

/** @type {typeof nodeChildProcess.execFileSync} */
// @ts-ignore -- overloads are forwarded verbatim
export function execFileSync(...raw) {
  const { file, args, rest } = splitArgs(raw);
  const [options, ...tail] = rest;
  const inv = resolvePortableInvocation(file, args, options);
  // @ts-ignore
  return nodeChildProcess.execFileSync(inv.command, inv.args, inv.options, ...tail);
}

/** @type {typeof nodeChildProcess.execFile} */
// @ts-ignore -- overloads are forwarded verbatim
export function execFile(...raw) {
  const { file, args, rest } = splitArgs(raw);
  // execFile(file, args, callback) / execFile(file, args, options, callback)
  const options = typeof rest[0] === 'function' ? undefined : rest[0];
  const tail = typeof rest[0] === 'function' ? rest : rest.slice(1);
  const inv = resolvePortableInvocation(file, args, options);
  // @ts-ignore
  return nodeChildProcess.execFile(inv.command, inv.args, inv.options ?? {}, ...tail);
}

// Preserve `util.promisify(execFile)` semantics (resolves `{ stdout, stderr }`).
// @ts-ignore -- custom promisify hook mirrors node:child_process
execFile[promisify.custom] = (...raw) => {
  const { file, args, rest } = splitArgs(raw);
  const [options] = rest;
  const inv = resolvePortableInvocation(file, args, options);
  // @ts-ignore
  return promisify(nodeChildProcess.execFile)(inv.command, inv.args, inv.options ?? {});
};
