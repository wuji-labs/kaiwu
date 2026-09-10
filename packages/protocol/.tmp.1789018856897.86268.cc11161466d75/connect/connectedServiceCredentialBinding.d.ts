import type { ConnectedServiceCredentialRecordV1, ConnectedServiceId } from './connectedServiceSchemas.js';
export declare class ConnectedServiceCredentialBindingMismatchError extends Error {
    readonly name = "ConnectedServiceCredentialBindingMismatchError";
    readonly code: "connected_service_credential_binding_mismatch";
    readonly serviceId: ConnectedServiceId;
    readonly profileId: string;
    constructor(binding: Readonly<{
        serviceId: ConnectedServiceId;
        profileId: string;
    }>);
}
export declare function assertConnectedServiceCredentialRecordBinding(params: Readonly<{
    binding: Readonly<{
        serviceId: ConnectedServiceId;
        profileId: string;
    }>;
    record: ConnectedServiceCredentialRecordV1;
}>): ConnectedServiceCredentialRecordV1;
//# sourceMappingURL=connectedServiceCredentialBinding.d.ts.map