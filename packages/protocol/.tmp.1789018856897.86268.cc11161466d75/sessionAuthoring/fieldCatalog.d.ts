type SessionAuthoringJsonPrimitive = null | string | number | boolean;
export interface SessionAuthoringJsonObject {
    readonly [key: string]: SessionAuthoringJsonValue;
}
export type SessionAuthoringJsonArray = ReadonlyArray<SessionAuthoringJsonValue>;
export type SessionAuthoringJsonValue = SessionAuthoringJsonPrimitive | SessionAuthoringJsonArray | SessionAuthoringJsonObject;
export declare const SessionAuthoringCheckoutCreationDraftV1Schema: any;
export declare const SessionAuthoringTerminalV1Schema: any;
export declare const SyncedSessionAuthoringTerminalV1Schema: any;
export declare const SyncedSessionAuthoringConnectedServicesV1Schema: any;
export declare const SessionAuthoringAutomationV1Schema: any;
export declare const SessionAuthoringCodexBackendModeSchema: any;
export declare const SESSION_AUTHORING_FIELD_CATALOG: {
    readonly machineId: {
        readonly schema: any;
        readonly description: "Selected execution machine for a not-yet-created session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly serverId: {
        readonly schema: any;
        readonly description: "Selected server scope for a not-yet-created session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly targetType: {
        readonly schema: any;
        readonly description: "Whether authored intent launches a new session or targets an existing session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
    };
    readonly directory: {
        readonly schema: any;
        readonly description: "Primary working directory for the authored session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
    };
    readonly checkoutCreationDraft: {
        readonly schema: any;
        readonly description: "Worktree creation draft persisted in authoring state before session creation.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip+section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly prompt: {
        readonly schema: any;
        readonly description: "Primary prompt/body authored for the session or automation.";
        readonly storageClass: "template";
        readonly draftStorage: "composer";
        readonly contexts: readonly ["newSession", "automationNewSession", "automationExistingSession", "liveSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: "";
    };
    readonly displayText: {
        readonly schema: any;
        readonly description: "Display-safe prompt text when the rendered message differs from raw prompt input.";
        readonly storageClass: "derived";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: "";
    };
    readonly agentId: {
        readonly schema: any;
        readonly description: "Selected built-in agent id when targeting a built-in backend.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly backendTarget: {
        readonly schema: any;
        readonly description: "Canonical backend target reference for built-in and configured backends.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly transcriptStorage: {
        readonly schema: any;
        readonly description: "Requested transcript storage mode for the authored session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly profileId: {
        readonly schema: any;
        readonly description: "Selected profile id to apply when the authored session starts.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly environmentVariables: {
        readonly schema: any;
        readonly description: "Explicit environment-variable overrides applied to the authored session.";
        readonly storageClass: "template";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly resumeSessionId: {
        readonly schema: any;
        readonly description: "Requested resume session id when session start should attach/reuse an existing runner.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly permissionMode: {
        readonly schema: any;
        readonly description: "Selected permission mode persisted as authored session intent.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
    readonly permissionModeUpdatedAt: {
        readonly schema: any;
        readonly description: "Timestamp for the last permission-mode change authored into the session configuration.";
        readonly storageClass: "derived";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
    readonly modelId: {
        readonly schema: any;
        readonly description: "Selected model id for the authored session/runtime.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
    readonly modelUpdatedAt: {
        readonly schema: any;
        readonly description: "Timestamp for the last model change authored into the session configuration.";
        readonly storageClass: "derived";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
    readonly mcpSelection: {
        readonly schema: any;
        readonly description: "Managed/unmanaged MCP selection authored for the session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly connectedServices: {
        readonly schema: any;
        readonly description: "Connected-services binding payload authored for the session runtime.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly draftSchema: any;
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly connectedServicesUpdatedAt: {
        readonly schema: any;
        readonly description: "Timestamp for the last connected-services binding change authored into the session configuration.";
        readonly storageClass: "derived";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
    readonly terminal: {
        readonly schema: any;
        readonly description: "Terminal/runtime attach preferences authored for the session.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly draftSchema: any;
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly windowsRemoteSessionLaunchMode: {
        readonly schema: any;
        readonly description: "Windows remote-session launch mode for authored sessions on Windows.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly windowsRemoteSessionConsole: {
        readonly schema: any;
        readonly description: "Windows console visibility setting for authored sessions.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly windowsTerminalWindowName: {
        readonly schema: any;
        readonly description: "Windows Terminal named window target for authored Windows remote sessions.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
        };
        readonly default: null;
    };
    readonly codexBackendMode: {
        readonly schema: any;
        readonly description: "Transitional Codex-specific runtime mode. Keep in compatibility/adapters, not as a permanent generic runtime abstraction.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly acpSessionModeId: {
        readonly schema: any;
        readonly description: "Selected ACP session mode id for providers/runtime kinds that expose session modes.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "chip";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly sessionConfigOptionOverrides: {
        readonly schema: any;
        readonly description: "Structured session configuration-option overrides authored for the session runtime.";
        readonly storageClass: "template";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["newSession", "liveSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly liveSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly existingSessionId: {
        readonly schema: any;
        readonly description: "Bound existing-session target id for existing-session automations and related authoring contexts.";
        readonly storageClass: "inheritedOnly";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly sessionEncryptionMode: {
        readonly schema: any;
        readonly description: "Storage-encryption mode for authored existing-session automation targets.";
        readonly storageClass: "inheritedOnly";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly automationExistingSession: "inherited";
        };
        readonly default: null;
    };
    readonly sessionEncryptionKeyBase64: {
        readonly schema: any;
        readonly description: "Optional data key required to re-open encrypted existing-session targets.";
        readonly storageClass: "inheritedOnly";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly sessionEncryptionVariant: {
        readonly schema: any;
        readonly description: "Encryption key variant for existing-session automation targets.";
        readonly storageClass: "inheritedOnly";
        readonly draftStorage: "exclude";
        readonly contexts: readonly ["automationExistingSession"];
        readonly defaultSurface: "hidden";
        readonly defaultEditabilityByContext: {
            readonly automationExistingSession: "hidden";
        };
        readonly default: null;
    };
    readonly automation: {
        readonly schema: any;
        readonly description: "Inline automation metadata attached to the current authored session intent.";
        readonly storageClass: "template";
        readonly draftStorage: "sync";
        readonly contexts: readonly ["newSession", "automationNewSession", "automationExistingSession"];
        readonly defaultSurface: "section";
        readonly defaultEditabilityByContext: {
            readonly newSession: "editable";
            readonly automationNewSession: "editable";
            readonly automationExistingSession: "editable";
        };
        readonly default: null;
    };
};
export {};
//# sourceMappingURL=fieldCatalog.d.ts.map