import { ConnectedServiceCredentialRecordV1Schema, } from './connectedServiceSchemas.js';
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function readString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function normalizeConnectedServiceOauthCredentialRawMetadata(raw) {
    const root = isRecord(raw) ? raw : {};
    const claudeAiOauthRaw = isRecord(root.claudeAiOauth)
        ? root.claudeAiOauth
        : isRecord(root['claude.ai_oauth'])
            ? root['claude.ai_oauth']
            : {};
    const subscriptionType = readString(claudeAiOauthRaw.subscriptionType);
    const rateLimitTier = readString(claudeAiOauthRaw.rateLimitTier);
    const claudeAiOauth = {
        ...(subscriptionType ? { subscriptionType } : {}),
        ...(rateLimitTier ? { rateLimitTier } : {}),
    };
    return Object.keys(claudeAiOauth).length > 0 ? { claudeAiOauth } : null;
}
export function buildConnectedServiceCredentialRecord(params) {
    const base = {
        v: 1,
        serviceId: params.serviceId,
        profileId: params.profileId,
        createdAt: params.now,
        updatedAt: params.now,
        expiresAt: params.kind === 'oauth' ? (params.expiresAt ?? null) : null,
    };
    const record = params.kind === 'oauth'
        ? {
            ...base,
            kind: 'oauth',
            oauth: {
                accessToken: params.oauth.accessToken,
                refreshToken: params.oauth.refreshToken,
                idToken: params.oauth.idToken,
                scope: params.oauth.scope,
                tokenType: params.oauth.tokenType,
                providerAccountId: params.oauth.providerAccountId,
                providerEmail: params.oauth.providerEmail,
                raw: normalizeConnectedServiceOauthCredentialRawMetadata(params.oauth.raw),
            },
            token: null,
        }
        : {
            ...base,
            kind: 'token',
            oauth: null,
            token: {
                token: params.token.token,
                providerAccountId: params.token.providerAccountId,
                providerEmail: params.token.providerEmail,
                raw: null,
            },
        };
    return ConnectedServiceCredentialRecordV1Schema.parse(record);
}
//# sourceMappingURL=buildConnectedServiceCredentialRecord.js.map