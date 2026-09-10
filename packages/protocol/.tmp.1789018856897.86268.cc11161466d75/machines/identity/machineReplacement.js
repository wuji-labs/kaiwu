import { z } from 'zod';
export const MachineReplacementReasonSchema = z.string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-z][a-z0-9_:-]*$/u);
export const MachineReplacementFieldsSchema = z.object({
    replacesMachineId: z.string().trim().min(1).optional(),
    replacementReason: MachineReplacementReasonSchema.optional(),
});
export function readMachineReplacementRegistrationIntent(input) {
    const parsed = MachineReplacementFieldsSchema.safeParse(input);
    if (!parsed.success)
        return null;
    const replacesMachineId = parsed.data.replacesMachineId?.trim();
    const replacementReason = parsed.data.replacementReason?.trim();
    if (!replacesMachineId || !replacementReason)
        return null;
    return { replacesMachineId, replacementReason };
}
//# sourceMappingURL=machineReplacement.js.map