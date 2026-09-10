import { z } from 'zod';
export declare const SERVER_IDENTITY_ID_PATTERN: RegExp;
export declare function normalizeServerIdentityIdCapability(value: unknown): string | null | undefined;
export declare const ServerIdentityCapabilitiesSchema: any;
export type ServerIdentityCapabilities = z.infer<typeof ServerIdentityCapabilitiesSchema>;
export declare const DEFAULT_SERVER_IDENTITY_CAPABILITIES: ServerIdentityCapabilities;
//# sourceMappingURL=serverIdentityCapabilities.d.ts.map