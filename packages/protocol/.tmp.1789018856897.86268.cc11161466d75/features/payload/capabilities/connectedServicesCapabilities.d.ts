import { z } from 'zod';
export declare const DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES: Readonly<{
    revisionGuard: false;
}>;
export declare const ConnectedServicesCredentialDeleteCapabilitiesSchema: any;
export declare const DEFAULT_CONNECTED_SERVICES_CAPABILITIES: Readonly<{
    credentialDelete: Readonly<{
        revisionGuard: false;
    }>;
}>;
export declare const ConnectedServicesCapabilitiesSchema: any;
export type ConnectedServicesCapabilities = z.infer<typeof ConnectedServicesCapabilitiesSchema>;
//# sourceMappingURL=connectedServicesCapabilities.d.ts.map