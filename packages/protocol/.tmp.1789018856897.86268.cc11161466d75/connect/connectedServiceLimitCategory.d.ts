import { z } from 'zod';
declare const ConnectedServiceLimitCategoryCanonicalSchema: any;
declare const ConnectedServiceLimitCategoryLegacyAliasSchema: any;
export type ConnectedServiceLimitCategoryV1 = z.infer<typeof ConnectedServiceLimitCategoryCanonicalSchema>;
export type ConnectedServiceLimitCategoryLegacyAliasV1 = z.infer<typeof ConnectedServiceLimitCategoryLegacyAliasSchema>;
export type ConnectedServiceLimitCategoryInputV1 = ConnectedServiceLimitCategoryV1 | ConnectedServiceLimitCategoryLegacyAliasV1;
export declare function normalizeConnectedServiceLimitCategoryV1(value: ConnectedServiceLimitCategoryInputV1): ConnectedServiceLimitCategoryV1;
export declare function readConnectedServiceLimitCategoryV1(value: unknown): ConnectedServiceLimitCategoryV1 | null;
export declare const ConnectedServiceLimitCategoryV1Schema: any;
export {};
//# sourceMappingURL=connectedServiceLimitCategory.d.ts.map