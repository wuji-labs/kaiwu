import { z } from 'zod';
import { ConnectedServiceBindingsV1Schema } from '../../connect/connectedServiceBindings.js';
const AgentIdSettingsKeySchema = z.string().trim().min(1);
export const ConnectedServicesDefaultAuthByAgentIdV1Schema = z
    .object({
    v: z.literal(1).default(1),
    bindingsByAgentId: z.record(AgentIdSettingsKeySchema, ConnectedServiceBindingsV1Schema).default({}),
})
    .strict()
    .catch({
    v: 1,
    bindingsByAgentId: {},
});
export const DEFAULT_CONNECTED_SERVICES_DEFAULT_AUTH_BY_AGENT_ID_V1 = ConnectedServicesDefaultAuthByAgentIdV1Schema.parse({});
export const ConnectedServicesProviderConfigSharingModeV1Schema = z.enum([
    'linked',
    'copied',
    'isolated',
]);
export const ConnectedServicesProviderStateSharingModeV1Schema = z.enum([
    'isolated',
    'shared',
]);
export const ConnectedServicesProviderStateSharingPolicyV1Schema = z
    .object({
    configMode: ConnectedServicesProviderConfigSharingModeV1Schema.default('linked'),
    // Default to shared session state: most users connect multiple accounts for
    // usage/quota and expect their provider sessions to continue across accounts.
    // Turning this off (via `defaults.stateMode` or a per-agent `byAgentId`
    // override) is the opt-out. Providers whose descriptor reports
    // `state.supported: false` ignore `shared` and stay isolated.
    stateMode: ConnectedServicesProviderStateSharingModeV1Schema.default('shared'),
})
    .strict();
const ConnectedServicesProviderStateSharingOverrideV1Schema = z
    .object({
    configMode: ConnectedServicesProviderConfigSharingModeV1Schema.optional(),
    stateMode: ConnectedServicesProviderStateSharingModeV1Schema.optional(),
})
    .strict();
const ConnectedServicesProviderStateSharingRiskAcknowledgementV1Schema = z
    .object({
    sharedStatePrivacy: z.boolean().optional(),
    symlinkUnavailable: z.boolean().optional(),
})
    .strict();
export const ConnectedServicesProviderStateSharingSettingsV1Schema = z
    .object({
    v: z.literal(1).default(1),
    defaults: ConnectedServicesProviderStateSharingPolicyV1Schema.default({
        configMode: 'linked',
        stateMode: 'shared',
    }),
    byAgentId: z
        .record(AgentIdSettingsKeySchema, ConnectedServicesProviderStateSharingOverrideV1Schema)
        .default({}),
    acknowledgedRisksByAgentId: z
        .record(AgentIdSettingsKeySchema, ConnectedServicesProviderStateSharingRiskAcknowledgementV1Schema)
        .default({}),
})
    .strict()
    .catch({
    v: 1,
    defaults: {
        configMode: 'linked',
        stateMode: 'shared',
    },
    byAgentId: {},
    acknowledgedRisksByAgentId: {},
});
export const DEFAULT_CONNECTED_SERVICES_PROVIDER_STATE_SHARING_SETTINGS_V1 = ConnectedServicesProviderStateSharingSettingsV1Schema.parse({});
export function resolveConnectedServicesProviderStateSharingPolicyV1(settingsLike, agentId) {
    const settings = ConnectedServicesProviderStateSharingSettingsV1Schema.parse(settingsLike);
    const override = settings.byAgentId[agentId];
    return {
        configMode: override?.configMode ?? settings.defaults.configMode,
        stateMode: override?.stateMode ?? settings.defaults.stateMode,
    };
}
//# sourceMappingURL=connectedServicesSettings.js.map