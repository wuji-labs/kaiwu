import { z } from 'zod';
declare const PromptBundleSchemaIdV1Schema: any;
export type PromptBundleSchemaIdV1 = z.infer<typeof PromptBundleSchemaIdV1Schema>;
export { PromptBundleSchemaIdV1Schema };
export declare const PromptBundleEntryV1Schema: any;
export type PromptBundleEntryV1 = z.infer<typeof PromptBundleEntryV1Schema>;
export declare const PromptBundleBodyV1Schema: any;
export type PromptBundleBodyV1 = z.infer<typeof PromptBundleBodyV1Schema>;
export declare const PROMPT_BUNDLE_SCHEMA_LIMITS_V1: Readonly<{
    maxEntries: 128;
    maxTotalBytes: number;
}>;
export type PromptBundleValidationResult = Readonly<{
    ok: true;
}> | Readonly<{
    ok: false;
    errorCode: 'unsupported_schema' | 'missing_required_entry' | 'invalid_request' | 'invalid_path' | 'duplicate_path' | 'size_limit_exceeded';
    message: string;
    path?: string;
    requiredPath?: string;
}>;
export declare function validatePromptBundleBodyV1AgainstSchemaId(input: Readonly<{
    bundleSchemaId: PromptBundleSchemaIdV1;
    body: PromptBundleBodyV1;
}>): PromptBundleValidationResult;
//# sourceMappingURL=promptBundleSchemas.d.ts.map