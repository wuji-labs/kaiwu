import { z } from 'zod';
export declare const SessionWorkStateStatusV1Schema: any;
export type SessionWorkStateStatusV1 = z.infer<typeof SessionWorkStateStatusV1Schema>;
export declare const SessionWorkStateStatusReasonV1Schema: any;
export type SessionWorkStateStatusReasonV1 = z.infer<typeof SessionWorkStateStatusReasonV1Schema>;
export declare const SessionWorkStateItemKindV1Schema: any;
export type SessionWorkStateItemKindV1 = z.infer<typeof SessionWorkStateItemKindV1Schema>;
export declare const SessionWorkStateItemOriginV1Schema: any;
export type SessionWorkStateItemOriginV1 = z.infer<typeof SessionWorkStateItemOriginV1Schema>;
export declare const SessionWorkStateGoalCapabilitiesV1Schema: any;
export type SessionWorkStateGoalCapabilitiesV1 = z.infer<typeof SessionWorkStateGoalCapabilitiesV1Schema>;
export declare const SessionWorkStateItemV1Schema: any;
export type SessionWorkStateItemV1 = z.infer<typeof SessionWorkStateItemV1Schema>;
export declare const SessionWorkStateTruncationV1Schema: any;
export type SessionWorkStateTruncationV1 = z.infer<typeof SessionWorkStateTruncationV1Schema>;
export declare const SessionWorkStateV1Schema: any;
export type SessionWorkStateV1 = z.infer<typeof SessionWorkStateV1Schema>;
export type SessionWorkStateUnknownItemV1 = Readonly<Record<string, unknown>>;
export type SessionWorkStateWriteItemV1 = SessionWorkStateItemV1 | SessionWorkStateUnknownItemV1;
export type SessionWorkStateWriteSnapshotV1 = Omit<SessionWorkStateV1, 'items'> & Readonly<{
    items: readonly SessionWorkStateWriteItemV1[];
}>;
export declare function readDisplayableSessionWorkStateV1(value: unknown): SessionWorkStateV1 | null;
//# sourceMappingURL=sessionWorkStateV1.d.ts.map