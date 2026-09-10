import { z } from 'zod';
// Intentionally scoped: this is the subset of providers that participate in v1 daemon-facing
// provider ids (direct sessions, handoff resume plans, MCP detection).
export const AGENT_PROVIDER_IDS_V1 = ['claude', 'codex', 'opencode', 'pi'];
export const AgentProviderIdV1Schema = z.enum(AGENT_PROVIDER_IDS_V1);
//# sourceMappingURL=agentProviderIdsV1.js.map