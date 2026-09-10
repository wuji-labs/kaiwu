import { z } from 'zod';
export declare const AgeBasedRetentionPolicySchema: any;
export declare const SessionRetentionPolicySchema: any;
export declare const ServerRetentionCapabilitiesSchema: any;
export type AgeBasedRetentionPolicy = z.infer<typeof AgeBasedRetentionPolicySchema>;
export type SessionRetentionPolicy = z.infer<typeof SessionRetentionPolicySchema>;
export type ServerRetentionCapabilities = z.infer<typeof ServerRetentionCapabilitiesSchema>;
//# sourceMappingURL=serverRetentionCapabilities.d.ts.map