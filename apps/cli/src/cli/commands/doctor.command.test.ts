import { describe, expect, it, vi } from 'vitest';

const {
  handleServiceRepairCliCommandMock,
  runDoctorCommandMock,
} = vi.hoisted(() => ({
  handleServiceRepairCliCommandMock: vi.fn(async () => undefined),
  runDoctorCommandMock: vi.fn(async () => undefined),
}));

vi.mock('./serviceRepair/handleServiceRepairCliCommand', () => ({
  handleServiceRepairCliCommand: handleServiceRepairCliCommandMock,
}));

vi.mock('@/ui/doctor', () => ({
  runDoctorCommand: runDoctorCommandMock,
}));

vi.mock('@/ui/doctorSnapshot', () => ({
  buildDoctorSnapshot: vi.fn(async () => ({
    capturedAt: '2026-02-23T00:00:00.000Z',
    server: {
      activeServerId: 'cloud',
      serverUrl: 'https://api.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
    },
    accountId: null,
    settings: {
      activeServerId: 'cloud',
      servers: [],
      knownAccountIds: [],
    },
  })),
}));

import { handleDoctorCliCommand } from './doctor';

describe('doctor command routing', () => {
  it('routes doctor repair through the bounded repair handler', async () => {
    await handleDoctorCliCommand({
      args: ['doctor', 'repair', '--yes'],
      rawArgv: ['node', 'happier', 'doctor', 'repair', '--yes'],
      terminalRuntime: null,
    });

    expect(handleServiceRepairCliCommandMock).toHaveBeenCalledWith({
      argv: ['repair', '--yes'],
      commandPath: 'kaiwu doctor',
    });
    expect(runDoctorCommandMock).not.toHaveBeenCalled();
  });
});
