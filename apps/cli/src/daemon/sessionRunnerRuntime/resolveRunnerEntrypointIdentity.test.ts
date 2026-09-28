import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';

import {
  resolveEntrypointIdentityFromLaunchSpec,
  resolveSessionRunnerEntrypointIdentity,
  resolveSessionRunnerEntrypointIdentityFromProcessCommand,
} from './resolveRunnerEntrypointIdentity';

describe('resolveSessionRunnerEntrypointIdentityFromProcessCommand', () => {
  it('parses pinned Happier CLI package-dist process commands', () => {
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      'node --no-warnings /Users/alice/.happier/cli-dev/versions/0.2.10/package-dist/index.mjs claude --happy-starting-mode remote --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      entrypointVersion: '0.2.10',
      comparableId: 'version:0.2.10',
    }));
  });

  it('parses quoted Windows pinned package-dist process commands', () => {
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      '"C:\\Program Files\\nodejs\\node.exe" "--no-warnings" "C:\\Users\\alice\\.happier\\cli\\versions\\0.2.11\\package-dist\\index.mjs" codex --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      entrypointVersion: '0.2.11',
      comparableId: 'version:0.2.11',
    }));
  });

  it('parses quoted Windows pinned kaiwu.exe binary process commands', () => {
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      '"C:\\Users\\alice\\.happier\\cli\\versions\\0.2.17\\kaiwu.exe" codex --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      entrypointVersion: '0.2.17',
      comparableId: 'version:0.2.17',
    }));
  });

  it('fails closed for mutable pointer commands', () => {
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      'node /Users/alice/.happier/cli-dev/current/package-dist/index.mjs claude --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'unknown',
      reason: 'mutable_entrypoint_pointer',
    }));
  });

  it('parses pinned runner-snapshot process commands into a snapshot generation identity', () => {
    // Live shape observed on 2026-07-10: daemon-spawned runners execute a flat pinned
    // dist snapshot (`.runner-snapshots/<distClosureFingerprint>/index.mjs`, no /dist/ segment).
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      'node --no-warnings --no-deprecation /Users/alice/dev/happier/apps/cli/.runner-snapshots/2ee2ef1b2f776a89/index.mjs claude --happy-starting-mode remote --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      comparableId: 'snapshot:2ee2ef1b2f776a89',
      entrypointVersion: null,
    }));
  });

  it('parses nested dist runner-snapshot commands into the same snapshot generation identity', () => {
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      'node /Users/alice/dev/happier/apps/cli/.runner-snapshots/2ee2ef1b2f776a89/dist/index.mjs claude --happy-starting-mode remote --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      comparableId: 'snapshot:2ee2ef1b2f776a89',
    }));
  });

  it('parses tsx source-mode commands into a source path identity, ignoring the tsx hook entrypoint', () => {
    // Live shape observed on 2026-07-10 (source-mode runner frozen at spawn).
    const identity = resolveSessionRunnerEntrypointIdentityFromProcessCommand(
      'node --no-warnings --no-deprecation --import /Users/alice/dev/happier/node_modules/tsx/dist/esm/index.mjs /Users/alice/dev/happier/apps/cli/src/index.ts codex --happy-starting-mode remote --started-by daemon',
    );

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      comparableId: 'path:/users/alice/dev/happier/apps/cli',
    }));
  });
});

describe('isGenerationAttestedComparableId', () => {
  it('treats version and snapshot generations as attested and mutable path roots as unattested', async () => {
    const { isGenerationAttestedComparableId } = await import('./resolveRunnerEntrypointIdentity');
    expect(isGenerationAttestedComparableId('version:0.2.10')).toBe(true);
    expect(isGenerationAttestedComparableId('snapshot:2ee2ef1b2f776a89')).toBe(true);
    expect(isGenerationAttestedComparableId('path:/users/alice/dev/happier/apps/cli')).toBe(false);
  });
});

describe('resolveEntrypointIdentityFromLaunchSpec', () => {
  it('derives a snapshot generation identity from a pinned snapshot launch spec', () => {
    const identity = resolveEntrypointIdentityFromLaunchSpec({
      runtime: 'node',
      filePath: '/usr/local/bin/node',
      args: [
        '--no-warnings',
        '--no-deprecation',
        '/Users/alice/dev/happier/apps/cli/.runner-snapshots/30bb29f6afae521d/index.mjs',
      ],
    });

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'launch_spec',
      comparableId: 'snapshot:30bb29f6afae521d',
    }));
  });

  it('derives current launch identity from the canonical launch spec entrypoint', () => {
    const identity = resolveEntrypointIdentityFromLaunchSpec({
      runtime: 'node',
      filePath: '/usr/local/bin/node',
      args: [
        '--no-warnings',
        '/Users/alice/.happier/cli-dev/versions/0.2.12/package-dist/index.mjs',
        'daemon',
        'start-sync',
      ],
    });

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'launch_spec',
      entrypointVersion: '0.2.12',
      comparableId: 'version:0.2.12',
    }));
  });

  it('identifies the installed binary acting as its own JS runtime by its package version, not the mutable script arg', () => {
    // Live shape observed on 2026-09-29 (Windows, 0.2.20): the daemon spawns runners as
    // `kaiwu.exe <home>/cli/current/package-dist/index.mjs ...`, where cli/current is a junction.
    const identity = resolveEntrypointIdentityFromLaunchSpec({
      runtime: 'node',
      filePath: 'C:\\Users\\WUJI\\.kaiwu\\bin\\kaiwu.exe',
      args: ['C:\\Users\\WUJI\\.kaiwu\\cli\\current\\package-dist\\index.mjs', 'claude'],
    });

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'launch_spec',
      comparableId: `version:${packageJson.version}`,
      entrypointVersion: packageJson.version,
    }));
  });

  it('derives launch identity from binary runtime pointing to cli binary without versions dir as package version', () => {
    const identity = resolveEntrypointIdentityFromLaunchSpec({
      runtime: 'binary',
      filePath: 'C:\\Users\\alice\\.kaiwu\\bin\\kaiwu.exe',
      args: [
        '--no-warnings',
        'C:\\Users\\alice\\.kaiwu\\cli\\versions\\1.0.0\\package-dist\\index.mjs',
        'daemon',
        'start-sync',
      ],
    });

    expect(identity).toEqual({
      status: 'known',
      source: 'launch_spec',
      comparableId: `version:${packageJson.version}`,
      entrypointVersion: packageJson.version,
    });
  });

  it('derives launch identity from binary runtime pointing to versioned cli binary', () => {
    const identity = resolveEntrypointIdentityFromLaunchSpec({
      runtime: 'binary',
      filePath: '/Users/alice/.kaiwu/cli/versions/0.2.15/kaiwu',
      args: ['daemon', 'start-sync'],
    });

    expect(identity).toEqual({
      status: 'known',
      source: 'launch_spec',
      comparableId: 'version:0.2.15',
      entrypointVersion: '0.2.15',
    });
  });
});

describe('resolveSessionRunnerEntrypointIdentity', () => {
  it('resolves binary runner with spawnedWithCliVersion using structured_state', () => {
    const identity = resolveSessionRunnerEntrypointIdentity({
      processCommand:
        'C:\\Users\\alice\\.kaiwu\\bin\\kaiwu.exe --no-warnings C:\\Users\\alice\\.kaiwu\\cli\\versions\\1.0.0\\package-dist\\index.mjs codex --happy-starting-mode remote --started-by daemon',
      spawnedWithCliVersion: '0.2.19',
    });

    expect(identity).toEqual({
      status: 'known',
      source: 'structured_state',
      comparableId: 'version:0.2.19',
      entrypointVersion: '0.2.19',
    });
  });

  it('resolves quoted binary runner with spawnedWithCliVersion using structured_state', () => {
    const identity = resolveSessionRunnerEntrypointIdentity({
      processCommand:
        '"C:\\Users\\alice\\.kaiwu\\bin\\kaiwu.exe" codex --happy-starting-mode remote --started-by daemon',
      spawnedWithCliVersion: '0.2.18',
    });

    expect(identity).toEqual({
      status: 'known',
      source: 'structured_state',
      comparableId: 'version:0.2.18',
      entrypointVersion: '0.2.18',
    });
  });

  it('resolves binary runner without spawnedWithCliVersion as binary_runner_version_unrecorded', () => {
    const identity = resolveSessionRunnerEntrypointIdentity({
      processCommand:
        '"C:\\Users\\alice\\.kaiwu\\bin\\kaiwu.exe" codex --happy-starting-mode remote --started-by daemon',
    });

    expect(identity).toEqual({
      status: 'unknown',
      source: 'unknown',
      reason: 'binary_runner_version_unrecorded',
    });
  });

  it('falls back to process command parsing for non-binary runners', () => {
    const identity = resolveSessionRunnerEntrypointIdentity({
      processCommand:
        'node --no-warnings /Users/alice/.happier/cli-dev/versions/0.2.10/package-dist/index.mjs claude --happy-starting-mode remote --started-by daemon',
      spawnedWithCliVersion: '0.2.19',
    });

    expect(identity).toEqual(expect.objectContaining({
      status: 'known',
      source: 'process_command',
      comparableId: 'version:0.2.10',
      entrypointVersion: '0.2.10',
    }));
  });
});
