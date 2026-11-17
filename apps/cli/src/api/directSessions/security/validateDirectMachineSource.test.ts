import { describe, expect, it } from 'vitest';

import { validateDirectMachineSource } from './validateDirectMachineSource';

describe('validateDirectMachineSource', () => {
  it('rejects Codex connectedService source ids with path traversal segments', () => {
    expect(
      validateDirectMachineSource({
        providerId: 'codex',
        source: {
          kind: 'codexHome',
          home: 'connectedService',
          connectedServiceId: '../escape',
        },
        env: {},
      }),
    ).toEqual({ ok: false, error: 'invalid connectedServiceId' });
  });

  it('accepts safe Codex connectedService source ids', () => {
    expect(
      validateDirectMachineSource({
        providerId: 'codex',
        source: {
          kind: 'codexHome',
          home: 'connectedService',
          connectedServiceId: 'openai-codex',
        },
        env: {},
      }),
    ).toEqual({
      ok: true,
      source: {
        kind: 'codexHome',
        home: 'connectedService',
        connectedServiceId: 'openai-codex',
      },
    });
  });

  it('normalizes Claude configDir against env HOME before validating the source', () => {
    expect(
      validateDirectMachineSource({
        providerId: 'claude',
        source: {
          kind: 'claudeConfig',
          configDir: '~/.claude',
        },
        env: {
          HOME: '/Users/tester',
          HAPPIER_CLAUDE_CONFIG_DIR: '~/.claude',
        },
      }),
    ).toEqual({
      ok: true,
      source: {
        kind: 'claudeConfig',
        configDir: '/Users/tester/.claude',
      },
    });
  });



});
