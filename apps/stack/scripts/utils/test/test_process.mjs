import { spawnSync } from 'node:child_process';

import { sanitizeDefinedEnv } from './test_env.mjs';

export function buildNodeTestArgs(testFiles, { serial = false, testTimeoutMs = null, forceExit = false } = {}) {
  const args = ['--test'];
  if (serial) args.push('--test-concurrency=1');
  const timeout = Number(testTimeoutMs);
  if (Number.isFinite(timeout) && timeout > 0) args.push(`--test-timeout=${Math.floor(timeout)}`);
  if (forceExit) args.push('--test-force-exit');
  args.push(...testFiles);
  return args;
}

// Stack unit tests spawn real node/CLI subprocesses. A fixture that never exits (or a leaked pipe
// handle) must fail the one test that owns it, not hang the whole serial run for hours.
export const DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS = 600_000;

export function resolveStackUnitTestTimeoutMs(env = process.env) {
  const raw = String(env?.KAIWU_STACK_TEST_TIMEOUT_MS ?? env?.HAPPIER_STACK_TEST_TIMEOUT_MS ?? '').trim();
  if (!raw) return DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS;
  const n = Number(raw);
  // 0 explicitly disables the per-test bound (debugging under an inspector).
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS;
}

export function runCommandSync(command, args, {
  cwd,
  env = process.env,
  stdio = 'inherit',
  encoding,
  timeout,
  sanitizeEnv = true,
} = {}) {
  return spawnSync(command, args, {
    cwd,
    env: sanitizeEnv ? sanitizeDefinedEnv(env) : env,
    stdio,
    encoding,
    timeout,
  });
}

export function runNodeTestFilesSync(testFiles, {
  cwd,
  env = process.env,
  serial = false,
  testTimeoutMs = null,
  forceExit = false,
  stdio = 'inherit',
} = {}) {
  const args = buildNodeTestArgs(testFiles, { serial, testTimeoutMs, forceExit });
  return runCommandSync(process.execPath, args, { cwd, env, stdio });
}
