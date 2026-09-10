import { z } from 'zod';
export declare const MACHINE_OWNER_CONFLICT_ERROR: "machine-owner-conflict";
export declare const MACHINE_DAEMON_STARTUP_SOURCE_VALUES: readonly ["manual", "background-service", "self-restart", "installer", "unknown"];
export declare const MachineDaemonStartupSourceSchema: any;
export declare const MachineDaemonOwnershipMetadataSchema: any;
export type MachineDaemonOwnershipMetadata = z.infer<typeof MachineDaemonOwnershipMetadataSchema>;
export declare const MachineOwnerConflictMetadataSchema: any;
export type MachineOwnerConflictMetadata = z.infer<typeof MachineOwnerConflictMetadataSchema>;
export declare const MachineOwnerConflictSocketPayloadSchema: any;
export type MachineOwnerConflictSocketPayload = z.infer<typeof MachineOwnerConflictSocketPayloadSchema>;
export declare function buildMachineScopedSocketAuth(params: Readonly<{
    token: string;
    machineId: string;
    runtimeId?: string;
    cliVersion?: string;
    publicReleaseChannel?: string;
    startupSource?: string;
    serviceManaged?: boolean;
    serviceLabel?: string;
    installationId?: string;
    installationPublicKey?: string;
    installationProof?: MachineDaemonOwnershipMetadata['installationProof'];
    takeover?: boolean;
}>): Record<string, unknown>;
export declare function readMachineDaemonOwnershipMetadataFromSocketAuth(input: unknown): MachineDaemonOwnershipMetadata;
export declare function buildMachineOwnerConflictSocketPayload(owner: MachineDaemonOwnershipMetadata): MachineOwnerConflictSocketPayload;
export declare function readMachineOwnerConflictSocketPayload(input: unknown): MachineOwnerConflictSocketPayload | null;
//# sourceMappingURL=daemonOwnership.d.ts.map