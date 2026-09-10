import { z } from 'zod';
export const OpenCodeAppSkillSchema = z
    .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    content: z.string().optional(),
})
    .passthrough();
export function normalizeOpenCodeAppSkills(value) {
    const skills = Array.isArray(value) ? value : [];
    return skills.flatMap((skill) => {
        const parsed = OpenCodeAppSkillSchema.safeParse(skill);
        if (!parsed.success)
            return [];
        return [{
                name: parsed.data.name,
                displayName: parsed.data.name,
                ...(parsed.data.description ? { description: parsed.data.description } : {}),
                ...(parsed.data.location ? { path: parsed.data.location } : {}),
                origin: 'opencode_native',
                enabled: true,
            }];
    });
}
//# sourceMappingURL=appSkills.js.map