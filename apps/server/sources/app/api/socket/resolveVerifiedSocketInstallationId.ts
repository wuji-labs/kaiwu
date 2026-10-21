import {
    machineInstallationPublicKeysEqual,
    verifyMachineInstallationRegistration,
} from "@/app/machines/installationProof";

/**
 * Returns the installation id a machine socket has proven it belongs to, or undefined.
 *
 * The proof must verify for this account and machine, and the installation id and public key must
 * match the installation already bound to the machine record. Anything else yields undefined so the
 * caller falls back to the ordinary (unverified) ownership rules.
 */
export function resolveVerifiedSocketInstallationId(params: Readonly<{
    accountId: string;
    machineId: string;
    machine: Readonly<{ installationId: string | null; installationPublicKey: Uint8Array | null }>;
    auth: Readonly<Record<string, unknown>> | null | undefined;
}>): string | undefined {
    const bound = params.machine;
    if (!bound.installationId || !bound.installationPublicKey) return undefined;

    const auth = params.auth ?? {};
    const installationId = typeof auth.installationId === "string" ? auth.installationId : null;
    const installationPublicKey = typeof auth.installationPublicKey === "string" ? auth.installationPublicKey : null;
    if (!installationId || !installationPublicKey || !auth.installationProof) return undefined;

    const verified = verifyMachineInstallationRegistration({
        accountId: params.accountId,
        machineId: params.machineId,
        installationId,
        installationPublicKey,
        installationProof: auth.installationProof,
        replacesMachineId: null,
        replacementReason: null,
        contentPublicKeyFingerprint: null,
    });
    if (!verified.ok || !verified.identity) return undefined;
    if (verified.identity.installationId !== bound.installationId) return undefined;
    if (!machineInstallationPublicKeysEqual(verified.identity.installationPublicKey, bound.installationPublicKey)) {
        return undefined;
    }
    return verified.identity.installationId;
}
