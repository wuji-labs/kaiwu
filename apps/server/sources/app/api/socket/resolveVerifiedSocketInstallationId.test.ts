import { describe, expect, it } from "vitest";
import tweetnacl from "tweetnacl";
import { encodeBase64, signMachineInstallationProof } from "@happier-dev/protocol";

import { resolveVerifiedSocketInstallationId } from "./resolveVerifiedSocketInstallationId";

function buildAuth(params: Readonly<{
    keyPair: tweetnacl.SignKeyPair;
    installationId?: string;
    machineId?: string;
    accountId?: string;
}>) {
    const installationId = params.installationId ?? "inst-1";
    return {
        installationId,
        installationPublicKey: encodeBase64(params.keyPair.publicKey, "base64url"),
        installationProof: signMachineInstallationProof({
            payload: {
                version: 1,
                installationId,
                machineId: params.machineId ?? "machine-1",
                accountId: params.accountId ?? "acct-1",
            },
            privateKey: encodeBase64(params.keyPair.secretKey, "base64url"),
        }),
    };
}

describe("resolveVerifiedSocketInstallationId", () => {
    const keyPair = tweetnacl.sign.keyPair();
    const machine = { installationId: "inst-1", installationPublicKey: keyPair.publicKey };

    it("returns the bound installation id for a valid proof from the bound key", () => {
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: buildAuth({ keyPair }),
        })).toBe("inst-1");
    });

    it("rejects a valid proof signed by a key other than the bound installation key", () => {
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: buildAuth({ keyPair: tweetnacl.sign.keyPair() }),
        })).toBeUndefined();
    });

    it("rejects a proof for another machine or account", () => {
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: buildAuth({ keyPair, machineId: "machine-2" }),
        })).toBeUndefined();
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: buildAuth({ keyPair, accountId: "acct-2" }),
        })).toBeUndefined();
    });

    it("rejects an installation id that differs from the machine's bound installation", () => {
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: buildAuth({ keyPair, installationId: "inst-2" }),
        })).toBeUndefined();
    });

    it("returns undefined when the machine has no bound installation or auth carries no proof", () => {
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine: { installationId: null, installationPublicKey: null },
            auth: buildAuth({ keyPair }),
        })).toBeUndefined();
        expect(resolveVerifiedSocketInstallationId({
            accountId: "acct-1",
            machineId: "machine-1",
            machine,
            auth: { installationId: "inst-1" },
        })).toBeUndefined();
    });
});
