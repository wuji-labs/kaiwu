import { z } from 'zod';
import { type ServerRetentionCapabilities } from './serverRetentionCapabilities.js';
export declare const ServerCapabilitiesSchema: any;
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
export type { ServerRetentionCapabilities };
export declare const DEFAULT_SERVER_CAPABILITIES: ServerCapabilities;
//# sourceMappingURL=serverCapabilities.d.ts.map