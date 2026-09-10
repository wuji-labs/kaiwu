import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureConsoleText } from '@/testkit/logger/captureOutput';

const sideEffects = vi.hoisted(() => ({
  evaluateCurrentDaemonOwner: vi.fn(async () => {
    throw new Error('help should not inspect daemon ownership');
  }),
  listDaemonSessions: vi.fn(async () => {
    throw new Error('help should not list daemon sessions');
  }),
  stopDaemon: vi.fn(async () => {
    throw new Error('help should not stop daemon');
  }),
  stopDaemonSession: vi.fn(async () => {
    throw new Error('help should not stop daemon sessions');
  }),
  spawnDetachedDaemonStartSync: vi.fn(async () => {
    throw new Error('help should not spawn daemon start-sync');
  }),
  startDaemon: vi.fn(async () => {
    throw new Error('help should not start daemon');
  }),
  restartDaemonAndWait: vi.fn(async () => {
    throw new Error('help should not restart daemon');
  }),
  readDaemonStatusSnapshot: vi.fn(async () => {
    throw new Error('help should not read daemon status');
  }),
  runDoctorCommand: vi.fn(async () => {
    throw new Error('help should not run doctor');
  }),
  getLatestDaemonLog: vi.fn(async () => {
    throw new Error('help should not read daemon logs');
  }),
}));

vi.mock('@/daemon/ownership/evaluateCurrentDaemonOwner', () => ({
  evaluateCurrentDaemonOwner: sideEffects.evaluateCurrentDaemonOwner,
}));

vi.mock('@/daemon/controlClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/daemon/controlClient')>();
  return {
    ...actual,
    listDaemonSessions: sideEffects.listDaemonSessions,
    stopDaemon: sideEffects.stopDaemon,
    stopDaemonSession: sideEffects.stopDaemonSession,
  };
});

vi.mock('@/daemon/runtime/spawnDetachedDaemonStartSync', () => ({
  spawnDetachedDaemonStartSync: sideEffects.spawnDetachedDaemonStartSync,
}));

vi.mock('@/daemon/startDaemon', () => ({
  startDaemon: sideEffects.startDaemon,
}));

vi.mock('@/daemon/restartDaemonAndWait', () => ({
  restartDaemonAndWait: sideEffects.restartDaemonAndWait,
}));

vi.mock('@/daemon/statusSnapshot', () => ({
  readDaemonStatusSnapshot: sideEffects.readDaemonStatusSnapshot,
}));

vi.mock('@/ui/doctor', () => ({
  runDoctorCommand: sideEffects.runDoctorCommand,
}));

vi.mock('@/ui/logger', () => ({
  getLatestDaemonLog: sideEffects.getLatestDaemonLog,
}));

import { handleDaemonCliCommand } from './daemon';

describe('happier daemon help safety', () => {
  beforeEach(() => {
    for (const mock of Object.values(sideEffects)) {
      mock.mockClear();
    }
  });

  it.each([
    'start',
    'start-sync',
    'stop',
    'restart',
    'status',
    'list',
    'logs',
    'stop-session',
  ])('prints help for `daemon %s --help` without daemon side effects', async (subcommand) => {
    const output = captureConsoleText();
    try {
      await handleDaemonCliCommand({
        args: ['daemon', subcommand, '--help'],
        rawArgv: ['happier', 'daemon', subcommand, '--help'],
        terminalRuntime: null,
      });

      expect(output.text()).toContain('kaiwu daemon');
      expect(output.text()).toContain('Usage:');
      for (const mock of Object.values(sideEffects)) {
        expect(mock).not.toHaveBeenCalled();
      }
    } finally {
      output.restore();
    }
  });
});
