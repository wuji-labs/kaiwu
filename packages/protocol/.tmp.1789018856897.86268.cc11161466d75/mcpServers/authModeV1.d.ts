import type { McpServerCatalogEntryV1 } from './settingsV1.js';
export type McpServerAuthModeV1 = 'none' | 'savedSecret' | 'machineEnv' | 'plainText';
export declare function inferMcpServerAuthModeV1(server: Pick<McpServerCatalogEntryV1, 'env' | 'remote'>): McpServerAuthModeV1;
//# sourceMappingURL=authModeV1.d.ts.map