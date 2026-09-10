import { z } from 'zod';
import { BackendTargetRefSchema } from '../backendTargets/backendTargetRef.js';
import { EphemeralTaskPermissionModeSchema } from '../ephemeralTasks.js';
export const LlmTaskRunnerConfigV1Schema = z
    .object({
    v: z.literal(1),
    backendTarget: BackendTargetRefSchema,
    modelId: z.string().refine((value) => value.trim().length > 0, {
        message: 'modelId must not be blank',
    }).optional(),
    permissionMode: EphemeralTaskPermissionModeSchema.optional(),
})
    .passthrough();
//# sourceMappingURL=llmTaskRunnerConfigV1.js.map