import { z } from 'zod';
export const DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES = Object.freeze({
    revisionGuard: false,
});
export const ConnectedServicesCredentialDeleteCapabilitiesSchema = z
    .object({
    revisionGuard: z.boolean().optional().default(DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES.revisionGuard),
})
    .default(DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES);
export const DEFAULT_CONNECTED_SERVICES_CAPABILITIES = Object.freeze({
    credentialDelete: DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES,
});
export const ConnectedServicesCapabilitiesSchema = z
    .object({
    credentialDelete: ConnectedServicesCredentialDeleteCapabilitiesSchema.optional().default(DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES),
})
    .default(DEFAULT_CONNECTED_SERVICES_CAPABILITIES);
//# sourceMappingURL=connectedServicesCapabilities.js.map