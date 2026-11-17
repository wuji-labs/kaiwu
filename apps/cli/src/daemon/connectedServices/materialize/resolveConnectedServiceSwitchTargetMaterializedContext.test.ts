import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT_ENV_KEY } from '../connectedServiceChildEnvironment';
import { resolveConnectedServiceSwitchTargetMaterializedContext } from './resolveConnectedServiceSwitchTargetMaterializedContext';

const IDENTITY = { v: 1 as const, id: 'csm_abc', createdAtMs: 123 };
const BASE = '/base/materialized';
// A real native env: multiple absolute paths with DISTINCT parents → no single derivable root and no
// explicit materialized-root key. This is what a tracked native session carries at switch time.
const NATIVE_ENV = { PATH: '/usr/bin', HOME: '/Users/leeroy', TMPDIR: '/var/tmp' } as const;

describe('resolveConnectedServiceSwitchTargetMaterializedContext', () => {




  it('prefers the freshly materialized runtime-auth selection env/root over the pre-switch inherited env (Rule A)', () => {
    // RD-SW-2 regression: a tracked CONNECTED session inherits the PRE-switch env (where the
    // session file trivially exists). The switch-time continuity proof must evaluate the
    // POST-materialization target the next spawn reads, otherwise a silent import failure settles
    // the switch on a vacuous proof and strands the session at the spawn-time strict gate.
    const oldConfigDir = '/homes/claude-subscription/old-member/claude/claude-config';
    const newConfigDir = '/homes/claude-subscription/new-member/claude/claude-config';
    const inheritedEnv = {
      [HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT_ENV_KEY]: oldConfigDir,
      CLAUDE_CONFIG_DIR: oldConfigDir,
      EXISTING: '1',
    };

    const result = resolveConnectedServiceSwitchTargetMaterializedContext({
      agentId: 'claude',
      baseDir: BASE,
      inheritedEnv,
      effectiveIdentity: IDENTITY,
      runtimeAuthSelection: {
        profileId: 'new-member',
        targetMaterializedEnv: { CLAUDE_CONFIG_DIR: newConfigDir },
        targetMaterializedRoot: newConfigDir,
      },
    });

    expect(result.targetMaterializedRoot).toBe(newConfigDir);
    expect(result.targetMaterializedEnv?.CLAUDE_CONFIG_DIR).toBe(newConfigDir);
    expect(result.targetMaterializedEnv?.[HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT_ENV_KEY]).toBe(newConfigDir);
    // Non-provider inherited entries survive the overlay (the next spawn env is base + materializer env).
    expect(result.targetMaterializedEnv?.EXISTING).toBe('1');
  });

  it('derives the post-materialization root from the selection env when the selection has no explicit root', () => {
    const newConfigDir = '/homes/claude-subscription/new-member/claude/claude-config';
    const result = resolveConnectedServiceSwitchTargetMaterializedContext({
      agentId: 'claude',
      baseDir: BASE,
      inheritedEnv: { CLAUDE_CONFIG_DIR: '/homes/claude-subscription/old-member/claude/claude-config' },
      effectiveIdentity: IDENTITY,
      runtimeAuthSelection: {
        targetMaterializedEnv: { CLAUDE_CONFIG_DIR: newConfigDir },
      },
    });

    // Same legacy single-parent derivation the inherited env uses, applied to the SELECTION env.
    expect(result.targetMaterializedRoot).toBe('/homes/claude-subscription/new-member/claude');
    expect(result.targetMaterializedEnv?.CLAUDE_CONFIG_DIR).toBe(newConfigDir);
  });

  it('keeps current behavior when the runtime-auth selection carries no materialized context', () => {
    const existingRoot = join(BASE, 'csm_existing', 'codex');
    const inheritedEnv = {
      [HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT_ENV_KEY]: existingRoot,
    };
    const result = resolveConnectedServiceSwitchTargetMaterializedContext({
      agentId: 'codex',
      baseDir: BASE,
      inheritedEnv,
      effectiveIdentity: IDENTITY,
      runtimeAuthSelection: { profileId: 'backup', record: { kind: 'oauth' } },
    });

    expect(result.targetMaterializedRoot).toBe(existingRoot);
    expect(result.targetMaterializedEnv).toBe(inheritedEnv);
  });
});
