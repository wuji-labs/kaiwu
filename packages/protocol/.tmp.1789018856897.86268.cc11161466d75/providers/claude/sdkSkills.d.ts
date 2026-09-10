import { z } from 'zod';
import type { SessionSkillCatalogItemV1 } from '../../sessionWorkState/sessionWorkStateRpc.js';
export declare const ClaudeSdkSkillsOptionSchema: any;
export type ClaudeSdkSkillsOption = z.infer<typeof ClaudeSdkSkillsOptionSchema>;
export declare function normalizeClaudeSdkInitSkills(value: unknown): SessionSkillCatalogItemV1[];
//# sourceMappingURL=sdkSkills.d.ts.map