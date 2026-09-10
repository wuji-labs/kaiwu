import { z } from 'zod';
import type { AgentActivityStatusV1 } from './agentActivityStatusV1.js';
/**
 * Presentation tone for an agent-activity status.
 *
 * Components switch on the six tones, never on the ten statuses: a status added to the vocabulary
 * needs one tone decision here instead of a colour/glyph branch in every surface. Tone is
 * deliberately theme-free — the tone -> ink/glyph binding belongs to the UI theme owner.
 */
export declare const AGENT_ACTIVITY_TONES_V1: readonly ["pending", "live", "attention", "success", "danger", "neutral"];
export declare const AgentActivityToneV1Schema: any;
export type AgentActivityToneV1 = z.infer<typeof AgentActivityToneV1Schema>;
/**
 * Total status -> tone mapping. The switch has no `default` arm on purpose: a new status makes the
 * function fail to compile at the `never` check below instead of silently reading as neutral.
 */
export declare function resolveAgentActivityTone(status: AgentActivityStatusV1): AgentActivityToneV1;
//# sourceMappingURL=agentActivityToneV1.d.ts.map