import { z } from 'zod';
export declare const SessionPendingInputInterruptAndRunRequestV1Schema: any;
export type SessionPendingInputInterruptAndRunRequestV1 = z.infer<typeof SessionPendingInputInterruptAndRunRequestV1Schema>;
export declare const SessionPendingInputInterruptAndRunResultV1Schema: any;
export type SessionPendingInputInterruptAndRunResultV1 = z.infer<typeof SessionPendingInputInterruptAndRunResultV1Schema>;
export declare function buildUnsupportedSessionPendingInputInterruptAndRunResult(sessionId: string, localId: string, method: string): SessionPendingInputInterruptAndRunResultV1;
//# sourceMappingURL=sessionPendingInputInterruptAndRunV1.d.ts.map