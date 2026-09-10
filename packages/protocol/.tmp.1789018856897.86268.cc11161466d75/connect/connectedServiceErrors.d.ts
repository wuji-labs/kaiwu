import { z } from 'zod';
export declare const CONNECTED_SERVICE_ERROR_CODES: {
    readonly credentialNotFound: "connect_credential_not_found";
    readonly credentialInvalid: "connect_credential_invalid";
    readonly credentialUnsupportedFormat: "connect_credential_unsupported_format";
    readonly credentialSealUnavailable: "connect_credential_seal_unavailable";
    readonly oauthStateMismatch: "connect_oauth_state_mismatch";
    readonly oauthTimeout: "connect_oauth_timeout";
    readonly oauthExchangeFailed: "connect_oauth_exchange_failed";
    readonly oauthInvalidGrant: "connect_oauth_invalid_grant";
    readonly oauthInvalidClient: "connect_oauth_invalid_client";
    readonly oauthMissingRefreshToken: "connect_oauth_missing_refresh_token";
    readonly reconnectRequired: "connect_reconnect_required";
    readonly reconnectProviderIdentityMismatch: "connect_reconnect_provider_identity_mismatch";
    readonly credentialMutationSuperseded: "connect_credential_mutation_superseded";
    readonly authGroupNotFound: "connect_group_not_found";
    readonly authGroupGenerationConflict: "connect_group_generation_conflict";
};
export declare const ConnectedServiceErrorCodeSchema: any;
export type ConnectedServiceErrorCode = z.infer<typeof ConnectedServiceErrorCodeSchema>;
//# sourceMappingURL=connectedServiceErrors.d.ts.map