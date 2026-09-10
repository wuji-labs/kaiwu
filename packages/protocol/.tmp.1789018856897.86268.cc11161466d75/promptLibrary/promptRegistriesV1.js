import { z } from 'zod';
import { PromptBundleBodyV1Schema, PromptBundleSchemaIdV1Schema } from './promptBundleSchemas.js';
import { PromptAssetExternalRefV1Schema, PromptAssetInstallModeV1Schema, PromptAssetMutationErrorCodeV1Schema, PromptAssetMutationPreviewV1Schema, PromptAssetScopeV1Schema, } from './promptAssetsV1.js';
export const PromptRegistryConfiguredSourceV1Schema = z.object({
    id: z.string().min(1),
    adapterId: z.string().min(1),
    title: z.string().min(1),
    enabled: z.boolean().default(true),
    config: z.record(z.string(), z.unknown()).default({}),
});
export const PromptRegistrySourcesV1Schema = z
    .object({
    v: z.literal(1).default(1),
    sources: z.array(PromptRegistryConfiguredSourceV1Schema).default([]),
})
    .catch({ v: 1, sources: [] });
export const PromptRegistryAdapterDescriptorV1Schema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    supportsConfiguredSources: z.boolean().default(false),
    supportsQuery: z.boolean().default(false),
    minimumQueryLength: z.number().int().min(1).optional(),
});
export const PromptRegistrySourceDescriptorV1Schema = z.object({
    id: z.string().min(1),
    adapterId: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().min(1).optional(),
    origin: z.enum(['built_in', 'user']),
});
export const PromptRegistryItemSummaryV1Schema = z.object({
    sourceId: z.string().min(1),
    itemId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    bundleSchemaId: PromptBundleSchemaIdV1Schema,
    displayPath: z.string().min(1),
    providerHints: z.array(z.string().min(1)).optional(),
});
export const PromptRegistryFetchedItemV1Schema = z.object({
    sourceId: z.string().min(1),
    itemId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    bundleSchemaId: PromptBundleSchemaIdV1Schema,
    bundleBody: PromptBundleBodyV1Schema,
});
export const PromptRegistryListSourcesRequestV1Schema = z.object({
    configuredSources: z.array(PromptRegistryConfiguredSourceV1Schema).default([]),
});
export const PromptRegistryScanSourceRequestV1Schema = z.object({
    sourceId: z.string().min(1),
    configuredSources: z.array(PromptRegistryConfiguredSourceV1Schema).default([]),
    query: z.string().trim().min(1).nullable().optional(),
});
export const PromptRegistryFetchItemRequestV1Schema = z.object({
    sourceId: z.string().min(1),
    itemId: z.string().min(1),
    configuredSources: z.array(PromptRegistryConfiguredSourceV1Schema).default([]),
});
export const PromptRegistryInstallTargetV1Schema = z.object({
    assetTypeId: z.string().min(1),
    scope: PromptAssetScopeV1Schema,
    directory: z.string().min(1).optional(),
    targetName: z.string().min(1),
    installMode: PromptAssetInstallModeV1Schema.optional(),
});
export const PromptRegistryInstallRequestV1Schema = z.object({
    sourceId: z.string().min(1),
    itemId: z.string().min(1),
    configuredSources: z.array(PromptRegistryConfiguredSourceV1Schema).default([]),
    installTarget: PromptRegistryInstallTargetV1Schema,
    previewOnly: z.boolean().optional(),
    expectedDigest: z.string().min(1).nullable().optional(),
});
export const PromptRegistryErrorCodeV1Schema = z.enum([
    'internal_error',
    'invalid_request',
    'not_found',
    'unsupported',
]);
export const PromptRegistryErrorResponseV1Schema = z.object({
    ok: z.literal(false),
    errorCode: PromptRegistryErrorCodeV1Schema,
    error: z.string().min(1),
});
export const PromptRegistryListAdaptersResponseV1Schema = z.union([
    z.object({
        ok: z.literal(true),
        adapters: z.array(PromptRegistryAdapterDescriptorV1Schema),
    }),
    PromptRegistryErrorResponseV1Schema,
]);
export const PromptRegistryListSourcesResponseV1Schema = z.union([
    z.object({
        ok: z.literal(true),
        sources: z.array(PromptRegistrySourceDescriptorV1Schema),
    }),
    PromptRegistryErrorResponseV1Schema,
]);
export const PromptRegistryScanSourceResponseV1Schema = z.union([
    z.object({
        ok: z.literal(true),
        items: z.array(PromptRegistryItemSummaryV1Schema),
    }),
    PromptRegistryErrorResponseV1Schema,
]);
export const PromptRegistryFetchItemResponseV1Schema = z.union([
    z.object({
        ok: z.literal(true),
        item: PromptRegistryFetchedItemV1Schema,
    }),
    PromptRegistryErrorResponseV1Schema,
]);
export const PromptRegistryInstallResponseV1Schema = z.union([
    z.object({
        ok: z.literal(true),
        externalRef: PromptAssetExternalRefV1Schema.optional(),
        digest: z.string().min(1).optional(),
        preview: PromptAssetMutationPreviewV1Schema.optional(),
    }),
    z.object({
        ok: z.literal(false),
        errorCode: PromptAssetMutationErrorCodeV1Schema,
        error: z.string().min(1),
        currentDigest: z.string().min(1).nullable().optional(),
    }),
]);
//# sourceMappingURL=promptRegistriesV1.js.map