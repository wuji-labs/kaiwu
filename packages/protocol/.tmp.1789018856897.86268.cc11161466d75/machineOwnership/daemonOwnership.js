import { z } from 'zod';
export const MACHINE_OWNER_CONFLICT_ERROR = 'machine-owner-conflict';
export const MACHINE_DAEMON_STARTUP_SOURCE_VALUES = [
    'manual',
    'background-service',
    'self-restart',
    'installer',
    'unknown',
];
export const MachineDaemonStartupSourceSchema = z.enum(MACHINE_DAEMON_STARTUP_SOURCE_VALUES);
export const MachineDaemonOwnershipMetadataSchema = z.object({
    runtimeId: z.string().trim().min(1).optional(),
    cliVersion: z.string().trim().min(1).optional(),
    publicReleaseChannel: z.string().trim().min(1).optional(),
    startupSource: MachineDaemonStartupSourceSchema.optional(),
    serviceManaged: z.boolean().optional(),
    serviceLabel: z.string().trim().min(1).optional(),
    installationId: z.string().trim().min(1).optional(),
    installationPublicKey: z.string().trim().min(1).optional(),
    installationProof: z.object({
        version: z.literal(1),
        algorithm: z.literal('ed25519'),
        signature: z.string().trim().min(1),
    }).optional(),
});
export const MachineOwnerConflictMetadataSchema = MachineDaemonOwnershipMetadataSchema.omit({
    runtimeId: true,
});
export const MachineOwnerConflictSocketPayloadSchema = z.object({
    error: z.literal(MACHINE_OWNER_CONFLICT_ERROR),
    statusCode: z.literal(409),
    owner: MachineOwnerConflictMetadataSchema,
});
function normalizeOptionalStringField(value) {
    const parsed = z.string().trim().min(1).safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function normalizeOptionalBooleanField(value) {
    const parsed = z.boolean().safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function normalizeOptionalStartupSource(value) {
    const parsed = MachineDaemonStartupSourceSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function normalizeOptionalInstallationProof(value) {
    const parsed = MachineDaemonOwnershipMetadataSchema.shape.installationProof.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function normalizeMachineDaemonOwnershipMetadata(input) {
    const object = typeof input === 'object' && input !== null ? input : {};
    return {
        ...(normalizeOptionalStringField(object.runtimeId) ? { runtimeId: normalizeOptionalStringField(object.runtimeId) } : null),
        ...(normalizeOptionalStringField(object.cliVersion) ? { cliVersion: normalizeOptionalStringField(object.cliVersion) } : null),
        ...(normalizeOptionalStringField(object.publicReleaseChannel)
            ? { publicReleaseChannel: normalizeOptionalStringField(object.publicReleaseChannel) }
            : null),
        ...(normalizeOptionalStartupSource(object.startupSource) ? { startupSource: normalizeOptionalStartupSource(object.startupSource) } : null),
        ...(typeof normalizeOptionalBooleanField(object.serviceManaged) === 'boolean'
            ? { serviceManaged: normalizeOptionalBooleanField(object.serviceManaged) }
            : null),
        ...(normalizeOptionalStringField(object.serviceLabel) ? { serviceLabel: normalizeOptionalStringField(object.serviceLabel) } : null),
        ...(normalizeOptionalStringField(object.installationId) ? { installationId: normalizeOptionalStringField(object.installationId) } : null),
        ...(normalizeOptionalStringField(object.installationPublicKey)
            ? { installationPublicKey: normalizeOptionalStringField(object.installationPublicKey) }
            : null),
        ...(normalizeOptionalInstallationProof(object.installationProof)
            ? { installationProof: normalizeOptionalInstallationProof(object.installationProof) }
            : null),
    };
}
export function buildMachineScopedSocketAuth(params) {
    const ownership = readMachineDaemonOwnershipMetadataFromSocketAuth(params);
    return {
        token: params.token,
        clientType: 'machine-scoped',
        machineId: params.machineId,
        ...ownership,
        ...(params.takeover === true ? { takeover: true } : null),
    };
}
export function readMachineDaemonOwnershipMetadataFromSocketAuth(input) {
    return normalizeMachineDaemonOwnershipMetadata(input);
}
export function buildMachineOwnerConflictSocketPayload(owner) {
    const normalizedOwner = normalizeMachineDaemonOwnershipMetadata(owner);
    const { runtimeId: _runtimeId, ...conflictOwner } = normalizedOwner;
    return {
        error: MACHINE_OWNER_CONFLICT_ERROR,
        statusCode: 409,
        owner: MachineOwnerConflictMetadataSchema.parse(conflictOwner),
    };
}
export function readMachineOwnerConflictSocketPayload(input) {
    const object = typeof input === 'object' && input !== null ? input : null;
    if (!object || object.error !== MACHINE_OWNER_CONFLICT_ERROR || object.statusCode !== 409) {
        return null;
    }
    const owner = readMachineDaemonOwnershipMetadataFromSocketAuth(object.owner);
    const { runtimeId: _runtimeId, ...conflictOwner } = owner;
    return {
        error: MACHINE_OWNER_CONFLICT_ERROR,
        statusCode: 409,
        owner: conflictOwner,
    };
}
//# sourceMappingURL=daemonOwnership.js.map