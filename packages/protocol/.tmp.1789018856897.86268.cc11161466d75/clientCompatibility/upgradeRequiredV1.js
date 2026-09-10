import { z } from 'zod';
import { ClientAppVersionSchema, ClientKindSchema, SafeHttpsUrlSchema, } from './primitives.js';
export const CLIENT_UPGRADE_REQUIRED_ERROR_CODE = 'client-upgrade-required';
export const CLIENT_UPGRADE_REQUIRED_HTTP_STATUS = 426;
export const ClientUpgradeRequiredRequirementV1Schema = z
    .object({
    v: z.literal(1),
    clientKind: ClientKindSchema.nullable(),
    minimumAppVersion: ClientAppVersionSchema.nullable(),
    updateUrl: SafeHttpsUrlSchema.nullable(),
})
    .strict();
export const ClientUpgradeRequiredV1Schema = z
    .object({
    error: z.literal(CLIENT_UPGRADE_REQUIRED_ERROR_CODE),
    requirement: ClientUpgradeRequiredRequirementV1Schema,
})
    .strict();
//# sourceMappingURL=upgradeRequiredV1.js.map