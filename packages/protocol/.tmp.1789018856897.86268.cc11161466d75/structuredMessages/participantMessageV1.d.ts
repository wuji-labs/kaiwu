import { z } from 'zod';
/**
 * Provider-agnostic structured payload for user messages that are routed to a specific participant
 * (agent-team teammate/broadcast, or a running execution run).
 *
 * Transport:
 * - Stored on the session transcript user message under `meta.happier`.
 * - The backend may use this meta to perform provider-specific routing (e.g. Claude Agent Teams).
 */
export declare const ParticipantRecipientV1Schema: any;
export type ParticipantRecipientV1 = z.infer<typeof ParticipantRecipientV1Schema>;
export declare const ParticipantMessageV1Schema: any;
export type ParticipantMessageV1 = z.infer<typeof ParticipantMessageV1Schema>;
export declare function parseParticipantMessageV1(input: unknown): ParticipantMessageV1 | null;
//# sourceMappingURL=participantMessageV1.d.ts.map