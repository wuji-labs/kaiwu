import { describe, expect, it } from 'vitest';

import { AGENT_IDS } from './types.js';
import { AGENT_AUTH_PROBE_CONFIG, getAgentAuthProbeConfig } from './auth.js';
import { getProviderCliRuntimeSpec } from './providers/providerCliRuntime.js';

describe('AGENT_AUTH_PROBE_CONFIG', () => {
  it('covers every built-in agent', () => {
    expect(Object.keys(AGENT_AUTH_PROBE_CONFIG).sort()).toEqual([...AGENT_IDS].sort());
  });

  it('marks Custom ACP as non-probeable background auth state', () => {
    expect(getAgentAuthProbeConfig('customAcp')).toMatchObject({
      agentId: 'customAcp',
      statusCommand: null,
      parser: 'unknown',
      backgroundChecks: 'manual_only',
    });
  });

  it('keeps Codex auth probing metadata centralized', () => {
    expect(getAgentAuthProbeConfig('codex')).toMatchObject({
      statusCommand: ['login', 'status'],
      parser: 'codexLoginStatus',
      backgroundChecks: 'safe',
      envVars: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    });
  });

  it('supports both current and legacy Claude credential file layouts', () => {
    expect(getAgentAuthProbeConfig('claude').credentialPaths).toEqual([
      '~/.claude/.credentials.json',
      '~/.claude/.claude.json',
    ]);
  });

  it('derives auth probe binary names from the provider runtime catalog', () => {
    for (const agentId of AGENT_IDS) {
      const runtimeSpec = getProviderCliRuntimeSpec(agentId);
      expect(getAgentAuthProbeConfig(agentId).binaryNames).toEqual([runtimeSpec.binaryName]);
    }
  });
});
