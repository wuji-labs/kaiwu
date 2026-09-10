import { z } from 'zod';
export declare const ContentPublicKeyFingerprintSchema: any;
export type ContentPublicKeyFingerprint = z.infer<typeof ContentPublicKeyFingerprintSchema>;
export declare const MachineInstallationPublicKeySchema: any;
export declare const MachineInstallationPrivateKeySchema: any;
export declare const MachineInstallationProofSignatureSchema: any;
export declare const MachineInstallationIdentityV1Schema: any;
export type MachineInstallationIdentityV1 = z.infer<typeof MachineInstallationIdentityV1Schema>;
export declare const MachineInstallationProofPayloadV1Schema: any;
export type MachineInstallationProofPayloadV1 = z.infer<typeof MachineInstallationProofPayloadV1Schema>;
export declare const MachineInstallationProofV1Schema: any;
export type MachineInstallationProofV1 = z.infer<typeof MachineInstallationProofV1Schema>;
export declare function buildMachineInstallationProofPayloadBytes(payload: MachineInstallationProofPayloadV1): Uint8Array;
export declare function signMachineInstallationProof(params: Readonly<{
    payload: MachineInstallationProofPayloadV1;
    privateKey: string | Uint8Array;
}>): MachineInstallationProofV1;
export declare function verifyMachineInstallationProof(params: Readonly<{
    payload: MachineInstallationProofPayloadV1;
    proof: MachineInstallationProofV1;
    publicKey: string | Uint8Array;
}>): boolean;
export declare function computeContentPublicKeyFingerprint(publicKey: Uint8Array | string): string;
//# sourceMappingURL=installationIdentity.d.ts.map