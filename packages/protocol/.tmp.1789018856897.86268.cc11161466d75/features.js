// `/v1/features` returns:
// - `features`: catalog feature gates (enablement only; derived-path `...enabled` bits)
// - `capabilities`: configuration/status details used by clients (not themselves catalog feature gates)
export { OAuthProviderStatusSchema } from './features/payload/oauthProviderStatus.js';
export { FeatureGateSchema } from './features/payload/featureGate.js';
export { BugReportsCapabilitiesSchema, BUG_REPORT_DEFAULT_ACCEPTED_ARTIFACT_KINDS, BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS, DEFAULT_BUG_REPORTS_CAPABILITIES, coerceBugReportsCapabilitiesFromFeaturesPayload, } from './features/payload/capabilities/bugReportsCapabilities.js';
export { VoiceCapabilitiesSchema, DEFAULT_VOICE_CAPABILITIES, } from './features/payload/capabilities/voiceCapabilities.js';
export { SocialFriendsCapabilitiesSchema, DEFAULT_SOCIAL_FRIENDS_CAPABILITIES, } from './features/payload/capabilities/socialFriendsCapabilities.js';
export { AuthCapabilitiesSchema, DEFAULT_AUTH_CAPABILITIES, } from './features/payload/capabilities/authCapabilities.js';
export { DEFAULT_MACHINE_TRANSFER_CAPABILITIES, DEFAULT_MACHINE_TRANSFER_SERVER_ROUTED_CAPABILITIES, MACHINE_TRANSFER_SERVER_ROUTED_MAX_BYTES_ENV_KEY, MachineTransferCapabilitiesSchema, MachineTransferServerRoutedCapabilitiesSchema, normalizeMachineTransferServerRoutedMaxBytes, readMachineTransferServerRoutedMaxBytes, } from './features/payload/capabilities/machineTransferCapabilities.js';
export { DEFAULT_PETS_COMPANION_CAPABILITIES, DEFAULT_PETS_CAPABILITIES, DEFAULT_PETS_PACKAGE_LIMITS_CAPABILITIES, DEFAULT_PETS_SYNC_CAPABILITIES, PetsCapabilitiesSchema, PetsCompanionCapabilitiesSchema, PetsEncryptedCustomPetSyncPolicySchema, PetsPackageLimitsCapabilitiesSchema, PetsSyncCapabilitiesSchema, PetsSyncSupportedMediaTypeSchema, } from './features/payload/capabilities/petsCapabilities.js';
export { DEFAULT_SERVER_IDENTITY_CAPABILITIES, SERVER_IDENTITY_ID_PATTERN, ServerIdentityCapabilitiesSchema, normalizeServerIdentityIdCapability, } from './features/payload/capabilities/serverIdentityCapabilities.js';
export { DEFAULT_SESSION_CAPABILITIES, DEFAULT_SESSION_MESSAGES_CAPABILITIES, SessionCapabilitiesSchema, SessionMessagesCapabilitiesSchema, } from './features/payload/capabilities/sessionCapabilities.js';
export { DEFAULT_SHARING_CAPABILITIES, DEFAULT_SHARING_PENDING_QUEUE_V2_CAPABILITIES, SharingCapabilitiesSchema, SharingPendingQueueV2CapabilitiesSchema, } from './features/payload/capabilities/sharingCapabilities.js';
export { CapabilitiesSchema } from './features/payload/capabilities/capabilitiesSchema.js';
export { ConnectedServicesCapabilitiesSchema, ConnectedServicesCredentialDeleteCapabilitiesSchema, DEFAULT_CONNECTED_SERVICES_CAPABILITIES, DEFAULT_CONNECTED_SERVICES_CREDENTIAL_DELETE_CAPABILITIES, } from './features/payload/capabilities/connectedServicesCapabilities.js';
export { FeatureGatesSchema } from './features/payload/featureGatesSchema.js';
export { FeaturesResponseSchema } from './features/payload/featuresResponseSchema.js';
//# sourceMappingURL=features.js.map