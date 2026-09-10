import { z } from 'zod';
export declare const ACTION_OPERATION_RPC_METHODS_V1: Readonly<{
    readonly list: "actionOperation.list.v1";
    readonly get: "actionOperation.get.v1";
    readonly cancel: "actionOperation.cancel.v1";
}>;
export declare const ActionOperationStateV1Schema: any;
export type ActionOperationStateV1 = z.infer<typeof ActionOperationStateV1Schema>;
export declare const ActionOperationProgressV1Schema: any;
export type ActionOperationProgressV1 = z.infer<typeof ActionOperationProgressV1Schema>;
/** Redacted Action executor failure projection safe for public operation UI. */
export declare const ActionOperationFailureV1Schema: any;
export type ActionOperationFailureV1 = z.infer<typeof ActionOperationFailureV1Schema>;
export declare const ActionOperationScopeV1Schema: any;
export type ActionOperationScopeV1 = z.infer<typeof ActionOperationScopeV1Schema>;
export declare const ActionOperationDomainRefV1Schema: any;
export type ActionOperationDomainRefV1 = z.infer<typeof ActionOperationDomainRefV1Schema>;
export declare const ActionOperationSnapshotV1Schema: any;
export type ActionOperationSnapshotV1 = z.infer<typeof ActionOperationSnapshotV1Schema>;
export declare const ActionOperationRevisionEphemeralV1Schema: any;
export type ActionOperationRevisionEphemeralV1 = z.infer<typeof ActionOperationRevisionEphemeralV1Schema>;
export declare const ActionOperationListV1RequestSchema: any;
export type ActionOperationListV1Request = z.infer<typeof ActionOperationListV1RequestSchema>;
export declare const ActionOperationListV1ResponseSchema: any;
export type ActionOperationListV1Response = z.infer<typeof ActionOperationListV1ResponseSchema>;
export declare const ActionOperationGetV1RequestSchema: any;
export type ActionOperationGetV1Request = z.infer<typeof ActionOperationGetV1RequestSchema>;
export declare const ActionOperationGetV1ResponseSchema: any;
export type ActionOperationGetV1Response = z.infer<typeof ActionOperationGetV1ResponseSchema>;
export declare const ActionOperationCancelV1RequestSchema: any;
export type ActionOperationCancelV1Request = z.infer<typeof ActionOperationCancelV1RequestSchema>;
export declare const ActionOperationCancelV1ResponseSchema: any;
export type ActionOperationCancelV1Response = z.infer<typeof ActionOperationCancelV1ResponseSchema>;
//# sourceMappingURL=actionOperationV1.d.ts.map