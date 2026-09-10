export declare const PET_PACKAGE_FORMAT_CODEX_ATLAS_V1: "codex-compatible-atlas-v1";
export declare const BUILT_IN_PET_IDS_V1: readonly ["blink", "fury", "milo", "oli", "titi"];
export type BuiltInPetIdV1 = (typeof BUILT_IN_PET_IDS_V1)[number];
export declare const PET_SYNC_SUPPORTED_MEDIA_TYPES_V1: ["image/png" | "image/webp", ...("image/png" | "image/webp")[]];
export declare const PET_ATLAS_V1: Readonly<{
    packageFormat: "codex-compatible-atlas-v1";
    columns: 8;
    rows: 9;
    cellWidth: 192;
    cellHeight: 208;
    width: 1536;
    height: 1872;
}>;
export declare const PET_ANIMATION_STATES_V1: readonly ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"];
export type PetAnimationStateV1 = (typeof PET_ANIMATION_STATES_V1)[number];
export declare const PET_ANIMATION_ROWS_V1: readonly ({
    row: number;
    state: "idle";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "running-right";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "running-left";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "waving";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "jumping";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "failed";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "waiting";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "running";
    frames: number;
    durationsMs: number[];
} | {
    row: number;
    state: "review";
    frames: number;
    durationsMs: number[];
})[];
export declare const PET_PACKAGE_LIMITS_V1: Readonly<{
    maxManifestBytes: number;
    maxCanonicalSpritesheetBytes: number;
    maxCanonicalPackageBytes: number;
    maxPreCanonicalImportBytes: number;
    maxImportedPetsPerAccount: 20;
    maxImportedPetBytesPerAccount: number;
    maxImportedPetsPerDevice: 20;
    maxImportedPetBytesPerDevice: number;
}>;
export declare const PET_DISCOVERY_LIMITS_V1: Readonly<{
    maxPetsPerRoot: 128;
    maxDiscoveryWallClockMs: 1500;
    maxCodexConnectedServiceRoots: 256;
    discoveryCacheTtlMs: 15000;
}>;
export declare const PET_DAEMON_RPC_DEBOUNCE_LIMITS_V1: Readonly<{
    discoverPackagesMinIntervalMs: 750;
    validatePackageMinIntervalMs: 500;
    importPackageMinIntervalMs: 500;
    forgetLocalPackageMinIntervalMs: 250;
    readPreviewAssetMinIntervalMs: 100;
}>;
//# sourceMappingURL=constants.d.ts.map