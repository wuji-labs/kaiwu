export declare const TERMINAL_PROVISIONING_V2_VERSION_BYTE = 0;
export declare const TERMINAL_PROVISIONING_V2_CONTENT_PRIVATE_KEY_BYTES = 32;
export declare const TERMINAL_PROVISIONING_V2_PLAINTEXT_BYTES: number;
export declare function sealTerminalProvisioningV2Payload(params: {
    contentPrivateKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    randomBytes: (length: number) => Uint8Array;
}): Uint8Array;
export declare function openTerminalProvisioningV2Payload(params: {
    payload: Uint8Array;
    recipientSecretKeyOrSeed: Uint8Array;
}): Uint8Array | null;
export declare function isTerminalProvisioningV3Payload(payload: Uint8Array): boolean;
export declare function sealTerminalProvisioningV3Payload(params: {
    contentPrivateKey: Uint8Array;
    terminalEphemeralPublicKey: Uint8Array;
    pairingSecret: Uint8Array;
    createdAtMs: number;
    expiresAtMs: number;
    randomBytes: (length: number) => Uint8Array;
}): Uint8Array;
export declare function openTerminalProvisioningV3Payload(params: {
    payload: Uint8Array;
    recipientSecretKeyOrSeed: Uint8Array;
    terminalEphemeralPublicKey: Uint8Array;
    pairingSecret: Uint8Array;
    createdAtMs: number;
    expiresAtMs: number;
    nowMs: number;
}): Uint8Array | null;
//# sourceMappingURL=terminalProvisioningV2.d.ts.map