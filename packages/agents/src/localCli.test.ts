import { describe, expect, it } from 'vitest';

import { AGENT_IDS } from './types.js';
import { getAgentLocalCliConfig, AGENT_LOCAL_CLI_CONFIG } from './localCli.js';

describe('AGENT_LOCAL_CLI_CONFIG', () => {
  it('covers every built-in agent', () => {
    expect(Object.keys(AGENT_LOCAL_CLI_CONFIG).sort()).toEqual([...AGENT_IDS].sort());
  });

  it('marks Custom ACP as a catalog-management backend without local CLI login', () => {
    expect(getAgentLocalCliConfig('customAcp')).toMatchObject({
      agentId: 'customAcp',
      detectKey: 'custom-acp',
      machineLoginKey: 'custom-acp',
      authSupport: 'unsupported',
      authLaunches: [],
    });
  });

  it('keeps Claude login launch metadata centralized', () => {
    expect(getAgentLocalCliConfig('claude')).toMatchObject({
      detectKey: 'claude',
      machineLoginKey: 'claude-code',
      authSupport: 'login_terminal',
    });
  });

  it('uses exactly one primary action for existing terminal-login providers', () => {
    for (const agentId of AGENT_IDS) {
      const config = getAgentLocalCliConfig(agentId);
      if (config.authSupport !== 'login_terminal') continue;
      expect(config.authLaunches).toHaveLength(1);
      expect(config.authLaunches[0]?.kind).toBe('primary');
    }
  });
});
