import { z } from 'zod';
export const ClaudeSdkSkillsOptionSchema = z.union([z.literal('all'), z.array(z.string().trim().min(1))]);
export function normalizeClaudeSdkInitSkills(value) {
    const names = Array.isArray(value) ? value : [];
    return names.flatMap((name) => {
        if (typeof name !== 'string' || name.trim().length === 0)
            return [];
        const normalized = name.trim();
        return [{
                name: normalized,
                displayName: normalized,
                origin: 'claude_native',
                enabled: true,
            }];
    });
}
//# sourceMappingURL=sdkSkills.js.map