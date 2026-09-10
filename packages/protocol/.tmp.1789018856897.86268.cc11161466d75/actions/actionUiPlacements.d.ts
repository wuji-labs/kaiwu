import { z } from 'zod';
/**
 * UI placement IDs are used to deterministically map actions into UI surfaces
 * (header buttons, command palette, context menus, etc.) without ad-hoc wiring.
 */
export declare const ACTION_UI_PLACEMENTS: readonly ["agent_input_chips", "session_header", "session_info", "session_action_menu", "command_palette", "slash_command", "voice_panel", "run_list", "run_card"];
export declare const ActionUiPlacementSchema: any;
export type ActionUiPlacement = z.infer<typeof ActionUiPlacementSchema>;
//# sourceMappingURL=actionUiPlacements.d.ts.map