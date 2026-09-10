import { type ConnectedServiceCredentialRecordV1, type ConnectedServiceId } from './connectedServiceSchemas.js';
export type ConnectedServiceOauthCredentialRawMetadata = Readonly<{
    claudeAiOauth?: Readonly<{
        subscriptionType?: string;
        rateLimitTier?: string;
    }>;
    'claude.ai_oauth'?: Readonly<{
        subscriptionType?: string;
        rateLimitTier?: string;
    }>;
}>;
export declare function normalizeConnectedServiceOauthCredentialRawMetadata(raw: unknown): ConnectedServiceOauthCredentialRawMetadata | null;
export declare function buildConnectedServiceCredentialRecord(params: Readonly<{
    now: number;
    serviceId: ConnectedServiceId;
    profileId: string;
    kind: 'oauth';
    expiresAt?: number | null;
    oauth: Readonly<{
        accessToken: string;
        refreshToken: string;
        idToken: string | null;
        scope: string | null;
        tokenType: string | null;
        providerAccountId: string | null;
        providerEmail: string | null;
        raw?: ConnectedServiceOauthCredentialRawMetadata | null;
    }>;
}> | Readonly<{
    now: number;
    serviceId: ConnectedServiceId;
    profileId: string;
    kind: 'token';
    token: Readonly<{
        token: string;
        providerAccountId: string | null;
        providerEmail: string | null;
    }>;
}>): ConnectedServiceCredentialRecordV1;
//# sourceMappingURL=buildConnectedServiceCredentialRecord.d.ts.map