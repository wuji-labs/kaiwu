import { z } from 'zod';
export { ConnectedServiceAuthGroupIdSchema, ConnectedServiceBindingSelectionV1Schema, ConnectedServiceBindingsV1Schema, ConnectedServiceIdSchema, ConnectedServiceProfileIdSchema, SessionConnectedServiceAuthSwitchRpcParamsSchema, type ConnectedServiceAuthGroupId, type ConnectedServiceBindingSelectionV1, type ConnectedServiceBindingsV1, type ConnectedServiceId, type ConnectedServiceProfileId, type SessionConnectedServiceAuthSwitchRpcParams, } from './connectedServiceBindings.js';
export declare const ConnectedServiceCredentialFormatSchema: any;
export type ConnectedServiceCredentialFormat = z.infer<typeof ConnectedServiceCredentialFormatSchema>;
export declare const ConnectedServiceCredentialKindSchema: any;
export type ConnectedServiceCredentialKind = z.infer<typeof ConnectedServiceCredentialKindSchema>;
export declare const ConnectedServiceCredentialHealthStatusV1Schema: any;
export type ConnectedServiceCredentialHealthStatusV1 = z.infer<typeof ConnectedServiceCredentialHealthStatusV1Schema>;
export declare function normalizeConnectedServiceCredentialHealthStatus(raw: unknown): ConnectedServiceCredentialHealthStatusV1;
export declare function isConnectedServiceCredentialHealthStatusReconnectRequired(status: ConnectedServiceCredentialHealthStatusV1 | null | undefined): boolean;
export declare function isConnectedServiceCredentialHealthStatusUsable(status: ConnectedServiceCredentialHealthStatusV1 | null | undefined): boolean;
export declare const ConnectedServiceCredentialRefreshFailureKindV1Schema: any;
export type ConnectedServiceCredentialRefreshFailureKindV1 = z.infer<typeof ConnectedServiceCredentialRefreshFailureKindV1Schema>;
export declare const ConnectedServiceCredentialHealthV1Schema: any;
export type ConnectedServiceCredentialHealthV1 = z.infer<typeof ConnectedServiceCredentialHealthV1Schema>;
/**
 * Opaque server-owned revision for one connected-service credential value.
 * It is intentionally independent from row timestamps and refresh-lease bookkeeping.
 */
export declare const ConnectedServiceCredentialRevisionV1Schema: any;
export type ConnectedServiceCredentialRevisionV1 = z.infer<typeof ConnectedServiceCredentialRevisionV1Schema>;
export declare const ConnectedServiceExecutionAuthorityV1Schema: any;
export type ConnectedServiceExecutionAuthorityV1 = z.infer<typeof ConnectedServiceExecutionAuthorityV1Schema>;
export declare const ConnectedServiceCredentialMutationGuardV1Schema: any;
export type ConnectedServiceCredentialMutationGuardV1 = z.infer<typeof ConnectedServiceCredentialMutationGuardV1Schema>;
export declare const ConnectedServiceCredentialRevisionedMutationSuccessV1Schema: any;
export declare const ConnectedServiceCredentialLegacyMutationSuccessV1Schema: any;
export declare const ConnectedServiceCredentialMutationSuccessV1Schema: any;
export declare const ConnectedServiceCredentialCompatibleMutationSuccessV1Schema: any;
export type ConnectedServiceCredentialMutationSuccessV1 = z.infer<typeof ConnectedServiceCredentialMutationSuccessV1Schema>;
export type ConnectedServiceCredentialCompatibleMutationSuccessV1 = z.infer<typeof ConnectedServiceCredentialCompatibleMutationSuccessV1Schema>;
export type ConnectedServiceCredentialRevisionBoundaryV1 = Readonly<{
    revisionSemantics: 'revisioned';
    credentialRevision: ConnectedServiceCredentialRevisionV1;
}> | Readonly<{
    revisionSemantics: 'legacy_unfenced';
    credentialRevision: null;
}>;
/**
 * Translates the exact server-v0.2.1 no-revision shape from
 * 4913c1e533c872a0712ba1c25b3104fd470aacc2 into an explicit unfenced semantic
 * state. A missing revision must never be treated as a successful CAS fence.
 * Remove the legacy branch when exact 0.2.1 leaves the supported predecessor window.
 */
export declare function readConnectedServiceCredentialRevisionBoundaryV1(value: object): ConnectedServiceCredentialRevisionBoundaryV1 | null;
export declare const ConnectedServiceCredentialMutationSupersededV1Schema: any;
export type ConnectedServiceCredentialMutationSupersededV1 = z.infer<typeof ConnectedServiceCredentialMutationSupersededV1Schema>;
export declare const ConnectedServiceCredentialMutationResponseV1Schema: any;
export type ConnectedServiceCredentialMutationResponseV1 = z.infer<typeof ConnectedServiceCredentialMutationResponseV1Schema>;
export declare const ConnectedServiceCredentialCompatibleMutationResponseV1Schema: any;
export type ConnectedServiceCredentialCompatibleMutationResponseV1 = z.infer<typeof ConnectedServiceCredentialCompatibleMutationResponseV1Schema>;
export declare const ConnectedServiceCredentialRecordV1Schema: any;
export type ConnectedServiceCredentialRecordV1 = z.infer<typeof ConnectedServiceCredentialRecordV1Schema>;
export declare const SealedConnectedServiceCredentialV1Schema: any;
export type SealedConnectedServiceCredentialV1 = z.infer<typeof SealedConnectedServiceCredentialV1Schema>;
export declare const ConnectedServiceQuotaUnitV1Schema: any;
export type ConnectedServiceQuotaUnitV1 = z.infer<typeof ConnectedServiceQuotaUnitV1Schema>;
export declare const ConnectedServiceQuotaSourceV1Schema: any;
export type ConnectedServiceQuotaSourceV1 = z.infer<typeof ConnectedServiceQuotaSourceV1Schema>;
export declare const ConnectedServiceQuotaConfidenceV1Schema: any;
export type ConnectedServiceQuotaConfidenceV1 = z.infer<typeof ConnectedServiceQuotaConfidenceV1Schema>;
export declare const ConnectedServiceQuotaRecoveryCreditKindV1Schema: any;
export type ConnectedServiceQuotaRecoveryCreditKindV1 = z.infer<typeof ConnectedServiceQuotaRecoveryCreditKindV1Schema>;
export declare const ConnectedServiceQuotaRecoveryCreditStatusV1Schema: any;
export type ConnectedServiceQuotaRecoveryCreditStatusV1 = z.infer<typeof ConnectedServiceQuotaRecoveryCreditStatusV1Schema>;
export declare const ConnectedServiceQuotaRecoveryCreditV1Schema: any;
export type ConnectedServiceQuotaRecoveryCreditV1 = z.infer<typeof ConnectedServiceQuotaRecoveryCreditV1Schema>;
export declare const ConnectedServiceQuotaRecoveryCreditsV1Schema: any;
export type ConnectedServiceQuotaRecoveryCreditsV1 = z.infer<typeof ConnectedServiceQuotaRecoveryCreditsV1Schema>;
export declare const ConnectedServiceQuotaMeterScopeV1Schema: any;
export type ConnectedServiceQuotaMeterScopeV1 = z.infer<typeof ConnectedServiceQuotaMeterScopeV1Schema>;
export declare const ConnectedServiceQuotaLimitScopeV1Schema: any;
export type ConnectedServiceQuotaLimitScopeV1 = z.infer<typeof ConnectedServiceQuotaLimitScopeV1Schema>;
export declare const ConnectedServiceQuotaResetSourceV1Schema: any;
export type ConnectedServiceQuotaResetSourceV1 = z.infer<typeof ConnectedServiceQuotaResetSourceV1Schema>;
export declare const ConnectedServiceQuotaMeterV1Schema: any;
export type ConnectedServiceQuotaMeterV1 = z.infer<typeof ConnectedServiceQuotaMeterV1Schema>;
export declare const ConnectedServiceUsageSourceBindingKindV1Schema: any;
export type ConnectedServiceUsageSourceBindingKindV1 = z.infer<typeof ConnectedServiceUsageSourceBindingKindV1Schema>;
export declare const ConnectedServiceUsageSourceV1Schema: any;
export type ConnectedServiceUsageSourceV1 = z.infer<typeof ConnectedServiceUsageSourceV1Schema>;
export declare const ConnectedServiceQuotaSnapshotV1Schema: any;
export type ConnectedServiceQuotaSnapshotV1 = z.infer<typeof ConnectedServiceQuotaSnapshotV1Schema>;
export declare const SealedConnectedServiceQuotaSnapshotV1Schema: any;
export type SealedConnectedServiceQuotaSnapshotV1 = z.infer<typeof SealedConnectedServiceQuotaSnapshotV1Schema>;
export declare const ConnectedServiceAuthGroupPolicyV1Schema: any;
export type ConnectedServiceAuthGroupPolicyV1 = z.infer<typeof ConnectedServiceAuthGroupPolicyV1Schema>;
export declare const ConnectedServiceAuthGroupPolicyPatchV1Schema: any;
export type ConnectedServiceAuthGroupPolicyPatchV1 = z.infer<typeof ConnectedServiceAuthGroupPolicyPatchV1Schema>;
export declare const ConnectedServiceAuthGroupMemberStateV1Schema: any;
export type ConnectedServiceAuthGroupMemberStateV1 = z.infer<typeof ConnectedServiceAuthGroupMemberStateV1Schema>;
export declare const ConnectedServiceAuthGroupStateV1Schema: any;
export type ConnectedServiceAuthGroupStateV1 = z.infer<typeof ConnectedServiceAuthGroupStateV1Schema>;
export declare const ConnectedServiceAuthGroupMemberV1Schema: any;
export type ConnectedServiceAuthGroupMemberV1 = z.infer<typeof ConnectedServiceAuthGroupMemberV1Schema>;
export declare const ConnectedServiceAuthGroupV1Schema: any;
export type ConnectedServiceAuthGroupV1 = z.infer<typeof ConnectedServiceAuthGroupV1Schema>;
export declare const ConnectedServiceAuthGroupRouteParamsV1Schema: any;
export type ConnectedServiceAuthGroupRouteParamsV1 = z.infer<typeof ConnectedServiceAuthGroupRouteParamsV1Schema>;
export declare const ConnectedServiceAuthGroupCreateRequestV1Schema: any;
export type ConnectedServiceAuthGroupCreateRequestV1 = z.infer<typeof ConnectedServiceAuthGroupCreateRequestV1Schema>;
export declare const ConnectedServiceAuthGroupPatchRequestV1Schema: any;
export type ConnectedServiceAuthGroupPatchRequestV1 = z.infer<typeof ConnectedServiceAuthGroupPatchRequestV1Schema>;
export declare const ConnectedServiceAuthGroupMemberCreateRequestV1Schema: any;
export type ConnectedServiceAuthGroupMemberCreateRequestV1 = z.infer<typeof ConnectedServiceAuthGroupMemberCreateRequestV1Schema>;
export declare const ConnectedServiceAuthGroupMemberPatchRequestV1Schema: any;
export type ConnectedServiceAuthGroupMemberPatchRequestV1 = z.infer<typeof ConnectedServiceAuthGroupMemberPatchRequestV1Schema>;
export declare const ConnectedServiceAuthGroupMemberDeleteRequestV1Schema: any;
export type ConnectedServiceAuthGroupMemberDeleteRequestV1 = z.infer<typeof ConnectedServiceAuthGroupMemberDeleteRequestV1Schema>;
export declare const ConnectedServiceAuthGroupActiveProfileRequestV1Schema: any;
export type ConnectedServiceAuthGroupActiveProfileRequestV1 = z.infer<typeof ConnectedServiceAuthGroupActiveProfileRequestV1Schema>;
export declare const ConnectedServiceAuthGroupRuntimeStatePatchRequestV1Schema: any;
export type ConnectedServiceAuthGroupRuntimeStatePatchRequestV1 = z.infer<typeof ConnectedServiceAuthGroupRuntimeStatePatchRequestV1Schema>;
export declare const ConnectedServiceAuthGroupListResponseV1Schema: any;
export type ConnectedServiceAuthGroupListResponseV1 = z.infer<typeof ConnectedServiceAuthGroupListResponseV1Schema>;
export declare const ConnectedServiceAuthGroupResponseV1Schema: any;
export type ConnectedServiceAuthGroupResponseV1 = z.infer<typeof ConnectedServiceAuthGroupResponseV1Schema>;
export declare const ConnectedServiceAuthGroupErrorCodeV1Schema: any;
export type ConnectedServiceAuthGroupErrorCodeV1 = z.infer<typeof ConnectedServiceAuthGroupErrorCodeV1Schema>;
export declare const ConnectedServiceAuthGroupErrorResponseV1Schema: any;
export type ConnectedServiceAuthGroupErrorResponseV1 = z.infer<typeof ConnectedServiceAuthGroupErrorResponseV1Schema>;
//# sourceMappingURL=connectedServiceSchemas.d.ts.map