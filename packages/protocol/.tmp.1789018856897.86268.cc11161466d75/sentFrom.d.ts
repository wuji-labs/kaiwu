import { z } from 'zod';
export declare const SENT_FROM_VALUES: readonly ["unknown", "cli", "web", "android", "ios", "mac", "retry", "e2e", "voice_agent"];
export type SentFrom = (typeof SENT_FROM_VALUES)[number];
/**
 * Normalized source identifier for message-meta `sentFrom`.
 *
 * Behavior:
 * - Known values parse as-is.
 * - Unknown/invalid values parse as `'unknown'` (forward compatible; never throws).
 */
export declare function createSentFromSchema(zod: typeof z): any;
export declare const SentFromSchema: any;
//# sourceMappingURL=sentFrom.d.ts.map