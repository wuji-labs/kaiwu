import { z } from 'zod';
import type { SessionVendorPluginSummaryV1 } from '../../sessionWorkState/sessionWorkStateRpc.js';
export declare const CodexAppServerPluginSummarySchema: any;
export type CodexAppServerPluginSummary = z.infer<typeof CodexAppServerPluginSummarySchema>;
export declare function normalizeCodexAppServerPluginSummaries(value: unknown): SessionVendorPluginSummaryV1[];
//# sourceMappingURL=appServerPlugin.d.ts.map