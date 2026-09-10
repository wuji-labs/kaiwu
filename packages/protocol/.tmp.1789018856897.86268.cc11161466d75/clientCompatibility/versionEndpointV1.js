import { z } from 'zod';
import { ClientAppVersionSchema, ClientKindSchema, ClientReleaseChannelSchema, SafeHttpsUrlSchema, } from './primitives.js';
export const VERSION_ENDPOINT_PATH = '/v1/version';
export const ClientVersionCheckRequestV1Schema = z
    .object({
    v: z.literal(1),
    clientKind: ClientKindSchema,
    appVersion: ClientAppVersionSchema,
    releaseChannel: ClientReleaseChannelSchema.optional(),
    appId: z.string().min(1).max(160).regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/).optional(),
})
    .strict();
const CurrentClientVersionResponseV1Schema = z
    .object({
    v: z.literal(1),
    status: z.literal('current'),
})
    .strict();
const ClientUpdateAvailableResponseV1Schema = z
    .object({
    v: z.literal(1),
    status: z.literal('update-available'),
    latestAppVersion: ClientAppVersionSchema,
    updateUrl: SafeHttpsUrlSchema,
})
    .strict();
const ClientUpgradeRequiredResponseV1Schema = z
    .object({
    v: z.literal(1),
    status: z.literal('upgrade-required'),
    minimumAppVersion: ClientAppVersionSchema,
    latestAppVersion: ClientAppVersionSchema.optional(),
    updateUrl: SafeHttpsUrlSchema.nullable(),
})
    .strict();
export const ClientVersionCheckResponseV1Schema = z.discriminatedUnion('status', [
    CurrentClientVersionResponseV1Schema,
    ClientUpdateAvailableResponseV1Schema,
    ClientUpgradeRequiredResponseV1Schema,
]);
//# sourceMappingURL=versionEndpointV1.js.map