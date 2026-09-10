import { z } from 'zod';
export declare const SessionMcpSelectionV1Schema: any;
export type SessionMcpSelectionV1 = z.infer<typeof SessionMcpSelectionV1Schema>;
export declare const SessionMcpSelectionRestartRequiredV1Schema: any;
export type SessionMcpSelectionRestartRequiredV1 = z.infer<typeof SessionMcpSelectionRestartRequiredV1Schema>;
/** Compares the effective selection policy; exclude wins over a redundant include. */
export declare function areSessionMcpSelectionsEquivalent(left: SessionMcpSelectionV1, right: SessionMcpSelectionV1): boolean;
export declare function parseSessionMcpSelectionV1Json(raw: string | null | undefined): SessionMcpSelectionV1 | null;
export declare function readSessionMcpSelectionV1FromMetadata(metadata: unknown): SessionMcpSelectionV1 | null;
export declare function readSessionMcpSelectionRestartRequiredV1FromMetadata(metadata: unknown): SessionMcpSelectionRestartRequiredV1 | null;
//# sourceMappingURL=sessionSelectionV1.d.ts.map