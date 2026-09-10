import { z } from 'zod';
import type { SessionSkillCatalogItemV1 } from '../../sessionWorkState/sessionWorkStateRpc.js';
export declare const OpenCodeAppSkillSchema: any;
export type OpenCodeAppSkill = z.infer<typeof OpenCodeAppSkillSchema>;
export declare function normalizeOpenCodeAppSkills(value: unknown): SessionSkillCatalogItemV1[];
//# sourceMappingURL=appSkills.d.ts.map