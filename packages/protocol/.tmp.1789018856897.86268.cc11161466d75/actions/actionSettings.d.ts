import { z } from 'zod';
import { type ActionId } from './actionIds.js';
import { type ActionSurfaces } from './actionSpecs.js';
import { type ActionUiPlacement } from './actionUiPlacements.js';
declare const ActionSurfaceKeySchema: any;
export type ActionSurfaceKey = z.infer<typeof ActionSurfaceKeySchema>;
export declare const ACTION_SETTINGS_OPT_IN_PLACEMENTS: readonly ["agent_input_chips"];
declare const ActionSettingsOverrideSchema: any;
export type ActionSettingsOverride = z.infer<typeof ActionSettingsOverrideSchema>;
export declare const ActionsSettingsV1Schema: any;
export type ActionsSettingsV1 = z.infer<typeof ActionsSettingsV1Schema>;
export type ActionEnablementContext = Readonly<{
    surface?: keyof ActionSurfaces | null;
    placement?: ActionUiPlacement | null;
}>;
export declare function isActionSettingsOptInPlacement(placement: ActionUiPlacement): boolean;
export declare function isActionEnabledByActionsSettings(actionId: ActionId, settings: ActionsSettingsV1, ctx?: ActionEnablementContext): boolean;
export {};
//# sourceMappingURL=actionSettings.d.ts.map