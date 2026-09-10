import { z } from 'zod';
export declare const BackendTargetKindSchema: any;
export type BackendTargetKind = z.infer<typeof BackendTargetKindSchema>;
declare const BuiltInAgentTargetSchema: any;
declare const ConfiguredAcpBackendTargetSchema: any;
export declare const BackendTargetRefSchema: any;
export type BackendTargetRefV1 = z.infer<typeof BackendTargetRefSchema>;
export declare const BackendTargetKeySchema: any;
export type BackendTargetKey = z.infer<typeof BackendTargetKeySchema>;
export declare function buildBackendTargetKey(target: BackendTargetRefV1): BackendTargetKey;
export declare function parseBackendTargetKey(key: string): BackendTargetRefV1;
export declare function isBuiltInAgentTarget(target: BackendTargetRefV1): target is z.infer<typeof BuiltInAgentTargetSchema>;
export declare function isConfiguredAcpBackendTarget(target: BackendTargetRefV1): target is z.infer<typeof ConfiguredAcpBackendTargetSchema>;
export {};
//# sourceMappingURL=backendTargetRef.d.ts.map