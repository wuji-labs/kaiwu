import { z } from 'zod';
import { ActionIdSchema, normalizeLegacyActionId } from './actionIds.js';
import { ActionSurfaceSchema, ActionToolExposureModeSchema, } from './actionSpecs.js';
import { ActionUiPlacementSchema } from './actionUiPlacements.js';
const ActionSurfaceKeySchema = ActionSurfaceSchema.keyof();
export const ACTION_SETTINGS_OPT_IN_PLACEMENTS = ['agent_input_chips'];
const ACTION_SETTINGS_OPT_IN_PLACEMENT_SET = new Set(ACTION_SETTINGS_OPT_IN_PLACEMENTS);
const ACTION_TOOL_EXPOSURE_MODE_KEYS = ['session_agent', 'mcp', 'cli'];
const ACTION_TOOL_EXPOSURE_MODE_KEY_SET = new Set(ACTION_TOOL_EXPOSURE_MODE_KEYS);
function normalizeActionToolExposureModes(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    const next = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!ACTION_TOOL_EXPOSURE_MODE_KEY_SET.has(key))
            continue;
        const parsed = ActionToolExposureModeSchema.safeParse(value);
        if (!parsed.success)
            continue;
        next[key] = parsed.data;
    }
    return next;
}
const ActionSettingsToolExposureModesSchema = z.preprocess(normalizeActionToolExposureModes, z.object({
    session_agent: ActionToolExposureModeSchema.optional(),
    mcp: ActionToolExposureModeSchema.optional(),
    cli: ActionToolExposureModeSchema.optional(),
}).default({}));
function normalizeLegacyActionSettingsOverride(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return raw;
    }
    const next = { ...raw };
    if (Array.isArray(next.disabledSurfaces)) {
        next.disabledSurfaces = next.disabledSurfaces.map((surface) => surface === 'session_control_cli' ? 'cli' : surface);
    }
    return next;
}
const ActionSettingsOverrideSchema = z.preprocess(normalizeLegacyActionSettingsOverride, z
    .object({
    enabled: z.boolean().optional(),
    enabledPlacements: z.array(ActionUiPlacementSchema).default([]),
    disabledSurfaces: z.array(ActionSurfaceKeySchema).default([]),
    disabledPlacements: z.array(ActionUiPlacementSchema).default([]),
    approvalRequiredSurfaces: z.array(ActionSurfaceKeySchema).default([]),
    toolExposureModes: ActionSettingsToolExposureModesSchema,
})
    .strict());
export const ActionsSettingsV1Schema = z
    .object({
    v: z.literal(1),
    // Accept unknown keys but filter them down to known ActionIds during transform so settings
    // survive action id additions without failing strict parsing.
    actions: z.record(z.string(), ActionSettingsOverrideSchema).default({}),
})
    .passthrough()
    .transform((value) => {
    const next = {};
    const actions = value.actions ?? {};
    for (const [rawId, override] of Object.entries(actions)) {
        const parsedId = ActionIdSchema.safeParse(normalizeLegacyActionId(rawId));
        if (!parsedId.success)
            continue;
        next[parsedId.data] = override;
    }
    return { v: 1, actions: next };
});
export function isActionSettingsOptInPlacement(placement) {
    return ACTION_SETTINGS_OPT_IN_PLACEMENT_SET.has(placement);
}
export function isActionEnabledByActionsSettings(actionId, settings, ctx) {
    const override = settings?.actions?.[actionId];
    if (override?.enabled === false)
        return false;
    const surface = ctx?.surface ?? null;
    if (surface && override?.disabledSurfaces?.includes(surface))
        return false;
    const placement = ctx?.placement ?? null;
    if (placement && isActionSettingsOptInPlacement(placement)) {
        if (override?.disabledPlacements?.includes(placement))
            return false;
        if (override?.enabledPlacements?.includes(placement))
            return true;
        return false;
    }
    if (placement && override?.disabledPlacements?.includes(placement))
        return false;
    return true;
}
//# sourceMappingURL=actionSettings.js.map