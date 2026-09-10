export class ConnectedServiceCredentialBindingMismatchError extends Error {
    name = 'ConnectedServiceCredentialBindingMismatchError';
    code = 'connected_service_credential_binding_mismatch';
    serviceId;
    profileId;
    constructor(binding) {
        super('Connected service credential does not match the requested binding');
        this.serviceId = binding.serviceId;
        this.profileId = binding.profileId;
    }
}
export function assertConnectedServiceCredentialRecordBinding(params) {
    if (params.record.serviceId !== params.binding.serviceId
        || params.record.profileId !== params.binding.profileId) {
        throw new ConnectedServiceCredentialBindingMismatchError(params.binding);
    }
    return params.record;
}
//# sourceMappingURL=connectedServiceCredentialBinding.js.map