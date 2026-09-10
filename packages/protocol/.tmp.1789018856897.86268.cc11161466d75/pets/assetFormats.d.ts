import { z } from 'zod';
export declare const PET_CANONICAL_SPRITESHEET_ASSET_FORMATS_V1: readonly [{
    readonly extension: "png";
    readonly mediaType: "image/png";
    readonly spritesheetPath: "spritesheet.png";
}, {
    readonly extension: "webp";
    readonly mediaType: "image/webp";
    readonly spritesheetPath: "spritesheet.webp";
}];
type PetCanonicalSpritesheetAssetFormatTupleV1 = typeof PET_CANONICAL_SPRITESHEET_ASSET_FORMATS_V1;
type PetCanonicalSpritesheetAssetFormatV1 = PetCanonicalSpritesheetAssetFormatTupleV1[number];
export type PetCanonicalSpritesheetExtensionV1 = PetCanonicalSpritesheetAssetFormatV1['extension'];
export type PetCanonicalSpritesheetMediaTypeV1 = PetCanonicalSpritesheetAssetFormatV1['mediaType'];
export type PetCanonicalSpritesheetPathV1 = PetCanonicalSpritesheetAssetFormatV1['spritesheetPath'];
export declare const PET_CANONICAL_SPRITESHEET_EXTENSIONS_V1: [PetCanonicalSpritesheetExtensionV1, ...PetCanonicalSpritesheetExtensionV1[]];
export declare const PET_CANONICAL_SPRITESHEET_MEDIA_TYPES_V1: [PetCanonicalSpritesheetMediaTypeV1, ...PetCanonicalSpritesheetMediaTypeV1[]];
export declare const PET_CANONICAL_SPRITESHEET_PATHS_V1: [PetCanonicalSpritesheetPathV1, ...PetCanonicalSpritesheetPathV1[]];
export declare function getCanonicalPetSpritesheetMediaTypeV1(spritesheetPath: unknown): PetCanonicalSpritesheetMediaTypeV1 | undefined;
export declare function isCanonicalPetSpritesheetMediaTypePairV1(value: {
    spritesheetPath: unknown;
    mediaType: unknown;
}): value is {
    spritesheetPath: PetCanonicalSpritesheetPathV1;
    mediaType: PetCanonicalSpritesheetMediaTypeV1;
};
export declare const PetCanonicalSpritesheetMediaTypeV1Schema: any;
export declare const PetCanonicalSpritesheetPathV1Schema: any;
export declare const PetCanonicalSpritesheetAssetV1Schema: any;
export declare function appendCanonicalPetSpritesheetMediaTypeIssueV1({ ctx, spritesheetPath, mediaType, mediaTypePath, }: {
    ctx: z.RefinementCtx;
    spritesheetPath: unknown;
    mediaType: unknown;
    mediaTypePath?: ReadonlyArray<string | number>;
}): void;
export {};
//# sourceMappingURL=assetFormats.d.ts.map