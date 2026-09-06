import { Buffer } from 'node:buffer';
import { spawn as spawnChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import {
  resolveWindowsCommandInvocation,
  type CommandInvocation,
} from '@happier-dev/cli-common/process';

import { resolveCliRuntimeAssetPath } from '@/runtime/assets/resolveCliRuntimeAssetPath';
import { resolveJavaScriptRuntimeExecutable } from '@/runtime/js/resolveJavaScriptRuntimeExecutable';

import type { Disposable, PtyExitEvent, PtyProcess, PtyProvider, PtySpawnParams } from './ptyProvider';

type NodeRelaySpawnProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio: 'pipe';
    windowsHide: true;
    windowsVerbatimArguments?: boolean;
  }>,
) => ChildProcessWithoutNullStreams;

const relayWriteFramePrefix = '\u001eHAPPIER_PTY_WRITE ';
const relayKillFallbackMs = 2_000;
const relayZombieDetectionMs = 5_000;

function normalizeArgs(args: string[] | string): string[] {
  return Array.isArray(args) ? [...args] : [String(args)];
}

function resolveArgsKind(args: string[] | string): 'array' | 'string' {
  return Array.isArray(args) ? 'array' : 'string';
}

function normalizeDimensionEnvValue(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 1
    ? String(Math.trunc(value))
    : undefined;
}

function encodeRelayWriteFrame(data: string): string {
  return `${relayWriteFramePrefix}${Buffer.from(data, 'utf8').toString('base64')}\n`;
}

function isRelayInputClosed(child: ChildProcessWithoutNullStreams, relayInputClosed: boolean): boolean {
  const stdin = child.stdin;
  return relayInputClosed ||
    stdin.destroyed === true ||
    stdin.writableEnded === true;
}

function assertRelayInputWritable(child: ChildProcessWithoutNullStreams, relayInputClosed: boolean): void {
  if (isRelayInputClosed(child, relayInputClosed)) {
    throw new Error('terminal_pty_input_closed');
  }
}

function childToPtyProcess(child: ChildProcessWithoutNullStreams): PtyProcess {
  const exitListeners = new Set<(event: PtyExitEvent) => void>();
  let completedExit: PtyExitEvent | null = null;
  let relayInputClosed = false;
  let killFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let zombieDetectionTimer: ReturnType<typeof setTimeout> | null = null;
  let hasExited = false;
  let seenExitCode: number | null = null;

  const emitExit = (event: PtyExitEvent) => {
    if (completedExit) return;
    completedExit = event;
    if (killFallbackTimer) {
      clearTimeout(killFallbackTimer);
      killFallbackTimer = null;
    }
    if (zombieDetectionTimer) {
      clearTimeout(zombieDetectionTimer);
      zombieDetectionTimer = null;
    }
    for (const listener of exitListeners) {
      listener(event);
    }
  };

  const killRelayProcess = (signal?: string) => {
    if (typeof signal === 'string' && signal.length > 0) {
      child.kill(signal as NodeJS.Signals);
      return;
    }
    child.kill();
  };

  const requestRelayTermination = (signal?: string) => {
    relayInputClosed = true;
    if (child.stdin.destroyed === true || child.stdin.writableEnded === true) {
      killRelayProcess(signal);
      return;
    }
    try {
      child.stdin.end();
    } catch {
      killRelayProcess(signal);
      return;
    }
    if (!killFallbackTimer) {
      killFallbackTimer = setTimeout(() => {
        if (!completedExit) {
          child.kill('SIGKILL');
        }
      }, relayKillFallbackMs);
      killFallbackTimer.unref?.();
    }
  };

  const recordExit = () => {
    if (hasExited) return;
    hasExited = true;
    relayInputClosed = true;
    const exitCode = typeof seenExitCode === 'number'
      ? seenExitCode
      : (typeof child.exitCode === 'number' ? child.exitCode : -1);
    emitExit({ exitCode });
  };

  const markExitSeen = (code: number | null, signal: NodeJS.Signals | null) => {
    relayInputClosed = true;
    if (typeof code === 'number') {
      seenExitCode = code;
    }
  };

  child.once('error', () => {
    emitExit({ exitCode: -1 });
  });
  child.stdin.on('error', () => {
    relayInputClosed = true;
  });
  child.once('exit', markExitSeen);
  child.once('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
    if (hasExited) return;
    const numericSignal = typeof signal === 'string' ? null : signal;
    emitExit({
      exitCode: typeof exitCode === 'number' ? exitCode : -1,
      ...(typeof numericSignal === 'number' ? { signal: numericSignal } : {}),
    } satisfies PtyExitEvent);
  });
  child.stdout.once('end', recordExit);
  child.stderr.once('end', recordExit);
  if (!zombieDetectionTimer) {
    zombieDetectionTimer = setTimeout(() => {
      if (!completedExit && !hasExited) {
        recordExit();
      }
    }, relayZombieDetectionMs);
    zombieDetectionTimer.unref?.();
  }

  return {
    write: (data) => {
      assertRelayInputWritable(child, relayInputClosed);
      child.stdin.write(encodeRelayWriteFrame(data));
    },
    resize: () => {
      throw new Error('terminal_resize_unavailable');
    },
    kill: requestRelayTermination,
    onData: (listener) => {
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      const onStdout = (chunk: string | Buffer) => {
        const decoded = typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk);
        if (decoded) listener(decoded);
      };
      const onStderr = (chunk: string | Buffer) => {
        const decoded = typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk);
        if (decoded) listener(decoded);
      };
      const onStdoutEnd = () => {
        const decoded = stdoutDecoder.end();
        if (decoded) listener(decoded);
      };
      const onStderrEnd = () => {
        const decoded = stderrDecoder.end();
        if (decoded) listener(decoded);
      };
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.stdout.on('end', onStdoutEnd);
      child.stderr.on('end', onStderrEnd);
      return {
        dispose: () => {
          child.stdout.off('data', onStdout);
          child.stderr.off('data', onStderr);
          child.stdout.off('end', onStdoutEnd);
          child.stderr.off('end', onStderrEnd);
        },
      } satisfies Disposable;
    },
    onExit: (listener) => {
      if (completedExit) {
        listener(completedExit);
        return { dispose: () => {} } satisfies Disposable;
      }
      exitListeners.add(listener);
      return {
        dispose: () => {
          exitListeners.delete(listener);
        },
      } satisfies Disposable;
    },
  };
}

export function buildNodePtyRelaySpawnCommand(params: Readonly<{
  nodeExecutable: string;
  relayScriptPath: string;
  file: string;
  args: string[] | string;
}>): Readonly<{ command: string; args: readonly string[] }> {
  const argsKind = resolveArgsKind(params.args);
  return {
    command: params.nodeExecutable,
    args: [params.relayScriptPath, '--args-kind', argsKind, '--', params.file, ...normalizeArgs(params.args)],
  };
}

export function createNodePtyRelayProvider(params?: Readonly<{
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  currentExecPath?: string | null;
  relayScriptPath?: string | null;
  resolveNodeExecutable?: () => string | null;
  spawnProcess?: NodeRelaySpawnProcess;
  resolveCommandInvocation?: typeof resolveWindowsCommandInvocation;
}>): PtyProvider | null {
  const platform = params?.platform ?? process.platform;
  if (platform !== 'win32') return null;

  const env = params?.env ?? process.env;
  const nodeExecutable =
    'resolveNodeExecutable' in (params ?? {})
      ? (params?.resolveNodeExecutable?.() ?? null)
      : resolveJavaScriptRuntimeExecutable({
        isBunRuntime: true,
        processEnv: env,
        currentExecPath: params?.currentExecPath ?? process.execPath,
      });
  if (!nodeExecutable) return null;

  const relayScriptPath =
    typeof params?.relayScriptPath === 'string' && params.relayScriptPath.trim().length > 0
      ? params.relayScriptPath
      : resolveCliRuntimeAssetPath('scripts', 'node_pty_relay.cjs');
  const spawnProcess = params?.spawnProcess ?? ((command, args, options) =>
    spawnChildProcess(command, [...args], options));
  const resolveCommandInvocation = params?.resolveCommandInvocation ?? resolveWindowsCommandInvocation;

  return {
    spawn: (spawnParams: PtySpawnParams) => {
      const relayInvocation = buildNodePtyRelaySpawnCommand({
        nodeExecutable,
        relayScriptPath,
        file: spawnParams.file,
        args: spawnParams.args,
      });
      const invocation: CommandInvocation = resolveCommandInvocation({
        command: relayInvocation.command,
        args: relayInvocation.args,
        env: spawnParams.options.env,
      });
      const relayEnv: NodeJS.ProcessEnv = {
        ...(spawnParams.options.env ?? env),
        HAPPIER_NODE_PTY_RELAY_COLS: normalizeDimensionEnvValue(spawnParams.options.cols),
        HAPPIER_NODE_PTY_RELAY_ROWS: normalizeDimensionEnvValue(spawnParams.options.rows),
      };
      const child = spawnProcess(invocation.command, invocation.args, {
        cwd: spawnParams.options.cwd,
        env: relayEnv,
        stdio: 'pipe',
        windowsHide: true,
        ...(invocation.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
      });
      return childToPtyProcess(child);
    },
  };
}
