import type { AgentId } from './types.js';
import type { AgentRuntimeModeSwitchKind } from './advancedModes.js';

export type AgentSessionModesKind = 'none' | 'acpPolicyPresets' | 'acpAgentModes' | 'staticAgentModes';

export type AgentSessionModeSource = 'none' | 'acp' | 'provider-native';

export type AgentSessionModeSemantics = 'none' | 'policy-presets' | 'agent-modes';

export type AgentAcpSessionModeSetMethod = 'set_mode' | 'config_option';

export type AgentSessionModeDescriptor = Readonly<{
  source: AgentSessionModeSource;
  semantics: AgentSessionModeSemantics;
  runtimeSwitch: AgentRuntimeModeSwitchKind;
  acpModeConfigOptionId?: string;
  acpModeSetMethod?: AgentAcpSessionModeSetMethod;
}>;

/**
 * Session mode surfacing intent for each agent.
 *
 * This is shared between CLI + UI so we can:
 * - keep deprecated alias mapping consistent (`--permission-mode plan` → `--agent-mode plan`)
 * - avoid duplicating “does this agent expose ACP modes?” logic across packages
 */
export const AGENT_SESSION_MODE_DESCRIPTORS: Readonly<Record<AgentId, AgentSessionModeDescriptor>> = Object.freeze({
  claude: { source: 'provider-native', semantics: 'agent-modes', runtimeSwitch: 'provider-native' },
  codex: { source: 'acp', semantics: 'policy-presets', runtimeSwitch: 'metadata-gating' },
  gemini: { source: 'none', semantics: 'none', runtimeSwitch: 'none' },
  customAcp: { source: 'acp', semantics: 'agent-modes', runtimeSwitch: 'acp-setSessionMode' },
});

function descriptorToSessionModesKind(descriptor: AgentSessionModeDescriptor): AgentSessionModesKind {
  if (descriptor.source === 'provider-native' && descriptor.semantics === 'agent-modes') {
    return 'staticAgentModes';
  }
  if (descriptor.source === 'acp' && descriptor.semantics === 'agent-modes') {
    return 'acpAgentModes';
  }
  if (descriptor.source === 'acp' && descriptor.semantics === 'policy-presets') {
    return 'acpPolicyPresets';
  }
  return 'none';
}

export const AGENT_SESSION_MODES: Readonly<Record<AgentId, AgentSessionModesKind>> = Object.freeze({
  claude: descriptorToSessionModesKind(AGENT_SESSION_MODE_DESCRIPTORS.claude),
  codex: descriptorToSessionModesKind(AGENT_SESSION_MODE_DESCRIPTORS.codex),
  gemini: descriptorToSessionModesKind(AGENT_SESSION_MODE_DESCRIPTORS.gemini),
  customAcp: descriptorToSessionModesKind(AGENT_SESSION_MODE_DESCRIPTORS.customAcp),
});

export function getAgentSessionModeDescriptor(agentId: AgentId): AgentSessionModeDescriptor {
  return AGENT_SESSION_MODE_DESCRIPTORS[agentId];
}

export function getAgentSessionModesKind(agentId: AgentId): AgentSessionModesKind {
  return descriptorToSessionModesKind(getAgentSessionModeDescriptor(agentId));
}
