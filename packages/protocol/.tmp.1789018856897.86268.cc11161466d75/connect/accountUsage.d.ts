import { z } from 'zod';
import { type AccountScopedCryptoMaterial, type AccountScopedOpenResult } from '../crypto/accountScopedCipher.js';
import { type ConnectedServiceQuotaSnapshotV1, type ConnectedServiceUsageSourceV1 } from './connectedServiceSchemas.js';
export declare const ProviderAccountUsageRecordIdSchema: any;
export type ProviderAccountUsageRecordId = z.infer<typeof ProviderAccountUsageRecordIdSchema>;
export declare function buildProviderAccountUsageOpaqueLocalCredentialRef(params: Readonly<{
    providerId: string;
    kind: string;
    value: string;
}>): string;
export declare const ProviderAccountUsageSubjectKindV1Schema: any;
export type ProviderAccountUsageSubjectKindV1 = z.infer<typeof ProviderAccountUsageSubjectKindV1Schema>;
export declare const ProviderAccountUsageQuotaScopeV1Schema: any;
export type ProviderAccountUsageQuotaScopeV1 = z.infer<typeof ProviderAccountUsageQuotaScopeV1Schema>;
export declare const ProviderAccountUsageRecordKeyV1Schema: any;
export type ProviderAccountUsageRecordKeyV1 = z.infer<typeof ProviderAccountUsageRecordKeyV1Schema>;
export declare const ProviderAccountSubjectRefV1Schema: any;
export type ProviderAccountSubjectRefV1 = z.infer<typeof ProviderAccountSubjectRefV1Schema>;
export declare const ProviderAccountUsageSourceV1Schema: any;
export type ProviderAccountUsageSourceV1 = z.infer<typeof ProviderAccountUsageSourceV1Schema>;
export declare const ProviderAccountUsageConfidenceV1Schema: any;
export type ProviderAccountUsageConfidenceV1 = z.infer<typeof ProviderAccountUsageConfidenceV1Schema>;
export declare const ProviderAccountUsageStateV1Schema: any;
export type ProviderAccountUsageStateV1 = z.infer<typeof ProviderAccountUsageStateV1Schema>;
export declare const ProviderAccountUsageDiagnosticV1Schema: any;
export type ProviderAccountUsageDiagnosticV1 = z.infer<typeof ProviderAccountUsageDiagnosticV1Schema>;
export declare const ProviderAccountUsageSnapshotV1Schema: any;
export type ProviderAccountUsageSnapshotV1 = z.infer<typeof ProviderAccountUsageSnapshotV1Schema>;
export declare const SealedProviderAccountUsageSnapshotV1Schema: any;
export type SealedProviderAccountUsageSnapshotV1 = z.infer<typeof SealedProviderAccountUsageSnapshotV1Schema>;
export declare function buildProviderAccountUsageRecordId(key: ProviderAccountUsageRecordKeyV1): ProviderAccountUsageRecordId;
export declare function projectProviderAccountUsageToConnectedServiceQuotaSnapshot(snapshot: ProviderAccountUsageSnapshotV1, source: ConnectedServiceUsageSourceV1): ConnectedServiceQuotaSnapshotV1 | null;
export declare function projectProviderAccountUsageSnapshotToConnectedServiceQuotaSnapshotV1(params: Readonly<{
    snapshot: ProviderAccountUsageSnapshotV1;
    source: ConnectedServiceUsageSourceV1;
}>): ConnectedServiceQuotaSnapshotV1 | null;
export declare function sealProviderAccountUsageSnapshotCiphertext(params: Readonly<{
    material: AccountScopedCryptoMaterial;
    payload: unknown;
    randomBytes: (length: number) => Uint8Array;
}>): string;
export declare function openProviderAccountUsageSnapshotCiphertext(params: Readonly<{
    material: AccountScopedCryptoMaterial;
    ciphertext: string;
}>): AccountScopedOpenResult;
//# sourceMappingURL=accountUsage.d.ts.map