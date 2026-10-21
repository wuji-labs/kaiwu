import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildRemoveWindowsScheduledTaskIfPresentPowerShellCommand,
  buildReadWindowsScheduledTaskStatusPowerShellCommand,
  buildStopWindowsScheduledTaskIfRunningPowerShellCommand,
  parseWindowsScheduledTaskStatusPowerShellJson,
  renderWindowsScheduledTaskWrapperPs1,
} from './windows';

describe('Windows scheduled task PowerShell status helper', () => {
  it('parses launch post-mortem fields from invariant JSON', () => {
    const parsed = parseWindowsScheduledTaskStatusPowerShellJson(JSON.stringify({
      exists: true,
      enabled: true,
      active: false,
      stateLabel: 'Ready',
      stateValue: 3,
      lastRunTime: '2026-04-29T16:29:54.0000000+02:00',
      lastTaskResult: 267009,
      taskToRun: 'powershell.exe -NoProfile -File C:\\Users\\test\\.happier\\services\\happier-daemon.default.ps1',
    }));

    expect(parsed).toEqual({
      exists: true,
      enabled: true,
      active: false,
      stateLabel: 'Ready',
      stateValue: 3,
      lastRunTime: '2026-04-29T16:29:54.0000000+02:00',
      lastTaskResult: 267009,
      taskToRun: 'powershell.exe -NoProfile -File C:\\Users\\test\\.happier\\services\\happier-daemon.default.ps1',
    });
  });

  it('queries launch post-mortem fields using culture-independent property names', () => {
    const command = buildReadWindowsScheduledTaskStatusPowerShellCommand({
      taskPath: '\\Happier\\',
      taskName: 'happier-daemon.default',
    });

    expect(command).toContain('Get-ScheduledTaskInfo');
    expect(command).toContain('LastTaskResult');
    expect(command).toContain('LastRunTime');
    expect(command).toContain('Actions');
    expect(command).toContain('ConvertTo-Json -Compress');
  });
});

describe('Windows scheduled task lifecycle PowerShell helpers', () => {
  it('propagates the daemon exit code from the generated wrapper', () => {
    const wrapper = renderWindowsScheduledTaskWrapperPs1({
      programArgs: ['C:\\Users\\test\\.kaiwu\\bin\\kaiwu-daemon.exe', 'daemon', 'start-sync'],
      stdoutPath: 'C:\\Users\\test\\.kaiwu\\logs\\daemon.out.log',
      stderrPath: 'C:\\Users\\test\\.kaiwu\\logs\\daemon.err.log',
      restartPolicy: 'no',
    });

    const commandIndex = wrapper.indexOf('& "C:\\Users\\test\\.kaiwu\\bin\\kaiwu-daemon.exe"');
    const captureIndex = wrapper.indexOf('$exitCode = [int]$LASTEXITCODE');
    const exitIndex = wrapper.indexOf('exit $exitCode');

    expect(commandIndex).toBeGreaterThanOrEqual(0);
    expect(captureIndex).toBeGreaterThan(commandIndex);
    expect(exitIndex).toBeGreaterThan(captureIndex);
  });

  it('returns both successful and failed child exits to Task Scheduler on Windows', () => {
    if (process.platform !== 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'happier-windows-wrapper-'));
    const childPath = join(root, 'child.ps1');
    const wrapperPath = join(root, 'wrapper.ps1');
    const stdoutPath = join(root, 'daemon.out.log');
    const stderrPath = join(root, 'daemon.err.log');

    try {
      writeFileSync(childPath, 'param([int]$Code)\nexit $Code\n', 'utf8');

      for (const expectedExitCode of [0, 7]) {
        writeFileSync(
          wrapperPath,
          renderWindowsScheduledTaskWrapperPs1({
            programArgs: [
              'powershell.exe',
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              childPath,
              '-Code',
              String(expectedExitCode),
            ],
            stdoutPath,
            stderrPath,
            restartPolicy: 'no',
          }),
          'utf8',
        );

        const result = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath],
          { encoding: 'utf8' },
        );

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(expectedExitCode);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still runs the child when a leftover process keeps the service log locked', () => {
    if (process.platform !== 'win32') return;

    // A wrapper stopped by Task Scheduler can leave its daemon child running, still holding the
    // redirected log handle. The next wrapper must not die opening that log.
    const root = mkdtempSync(join(tmpdir(), 'happier-windows-wrapper-locked-log-'));
    const childPath = join(root, 'child.ps1');
    const wrapperPath = join(root, 'wrapper.ps1');
    const markerPath = join(root, 'ran.txt');
    const stdoutPath = join(root, 'daemon.out.log');
    const stderrPath = join(root, 'daemon.err.log');

    try {
      writeFileSync(childPath, `Set-Content -LiteralPath '${markerPath}' -Value ran\nWrite-Output hello\nexit 3\n`, 'utf8');
      writeFileSync(stdoutPath, '', 'utf8');
      writeFileSync(
        wrapperPath,
        renderWindowsScheduledTaskWrapperPs1({
          programArgs: ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', childPath],
          stdoutPath,
          stderrPath,
          restartPolicy: 'no',
        }),
        'utf8',
      );

      const holder = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          [
            `$lock = [System.IO.File]::Open('${stdoutPath}', 'Open', 'ReadWrite', 'None')`,
            `& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '${wrapperPath}'`,
            '$code = $LASTEXITCODE',
            '$lock.Dispose()',
            'exit $code',
          ].join('; '),
        ],
        { encoding: 'utf8' },
      );

      expect(holder.error).toBeUndefined();
      expect(holder.status).toBe(3);
      expect(existsSync(markerPath)).toBe(true);
      const fallbackLogs = readdirSync(root).filter((name) => /^daemon\.out\.\d+\.log$/.test(name));
      expect(fallbackLogs).toHaveLength(1);
      // Windows PowerShell 5 redirection writes UTF-16LE.
      expect(readFileSync(join(root, fallbackLogs[0]!), 'utf16le')).toContain('hello');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retries a failed child and keeps the task alive when the next run succeeds', () => {
    if (process.platform !== 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'happier-windows-wrapper-retry-'));
    const childPath = join(root, 'child.ps1');
    const wrapperPath = join(root, 'wrapper.ps1');
    const counterPath = join(root, 'attempts.txt');
    const stdoutPath = join(root, 'daemon.out.log');
    const stderrPath = join(root, 'daemon.err.log');

    try {
      writeFileSync(
        childPath,
        [
          'param([string]$CounterPath)',
          '$attempts = if (Test-Path -LiteralPath $CounterPath) { [int](Get-Content -LiteralPath $CounterPath) } else { 0 }',
          '$attempts += 1',
          'Set-Content -LiteralPath $CounterPath -Value $attempts',
          'if ($attempts -eq 1) { exit 7 }',
          'exit 0',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        wrapperPath,
        renderWindowsScheduledTaskWrapperPs1({
          programArgs: [
            'powershell.exe',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            childPath,
            '-CounterPath',
            counterPath,
          ],
          stdoutPath,
          stderrPath,
          restartPolicy: 'on-failure',
        }),
        'utf8',
      );

      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath],
        { encoding: 'utf8', timeout: 15_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(readFileSync(counterPath, 'utf8').trim()).toBe('2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('stops only an existing running task through typed scheduler state', () => {
    const command = buildStopWindowsScheduledTaskIfRunningPowerShellCommand({
      qualifiedTaskName: 'Happier\\happier-daemon.default',
      definitionPath: 'C:\\Users\\test\\.happier\\services\\happier-daemon.default.ps1',
    });

    expect(command).toContain('Get-ScheduledTask');
    expect(command).toContain('[int]$task.State -eq 4');
    expect(command).toContain('Get-CimInstance Win32_Process');
    expect(command).toContain('-File `"C:\\Users\\test\\.happier\\services\\happier-daemon.default.ps1`"');
    expect(command).toContain('taskkill.exe /PID $processId /T /F');
    expect(command.indexOf('Stop-ScheduledTask')).toBeLessThan(command.indexOf('taskkill.exe'));
    expect(command).toContain('Stop-ScheduledTask');
    expect(command).toContain('-ErrorAction Stop');
    expect(command.trim()).toMatch(/exit 0$/);
    expect(command).not.toContain('schtasks');
  });

  it('removes only an existing task without parsing localized command output', () => {
    const command = buildRemoveWindowsScheduledTaskIfPresentPowerShellCommand({
      qualifiedTaskName: 'Happier\\happier-daemon.default',
    });

    expect(command).toContain('Get-ScheduledTask');
    expect(command).toContain('Unregister-ScheduledTask');
    expect(command).toContain('-Confirm:$false');
    expect(command).toContain('-ErrorAction Stop');
    expect(command.trim()).toMatch(/exit 0$/);
    expect(command).not.toContain('schtasks');
  });
});
