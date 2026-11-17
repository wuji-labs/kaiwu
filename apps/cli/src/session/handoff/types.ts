import type {
  AgentRuntimeDescriptorV1,
  DirectSessionsSource,
  SessionHandoffCodexAffinity,
  SessionHandoffCodexBackendMode,
} from '@happier-dev/protocol';

export type HandoffProviderId = 'claude' | 'codex';

export type SessionHandoffFileSlice = Readonly<{
  t: 'happier.handoff.file.v1';
  filePath: string;
  offsetBytes: number;
  sizeBytes: number;
}>;

export type HandoffResumePlan = Readonly<{
  directory: string;
  agent: HandoffProviderId;
  resume: string;
  environmentVariables?: Record<string, string>;
  transcriptStorage: 'direct' | 'persisted';
  approvedNewDirectoryCreation: true;
  codexBackendMode?: SessionHandoffCodexBackendMode;
}>; 

export type ClaudeSessionBundle = Readonly<{
  providerId: 'claude';
  remoteSessionId: string;
}> & (
  | Readonly<{ transcriptBase64: string; transcriptFile?: never }>
  | Readonly<{ transcriptFile: SessionHandoffFileSlice; transcriptBase64?: never }>
);

export type CodexSessionBundle = Readonly<{
  providerId: 'codex';
  remoteSessionId: string;
  affinity?: SessionHandoffCodexAffinity;
  files: readonly Readonly<{
    relativePath: string;
  } & (
    | Readonly<{ contentBase64: string; contentFile?: never }>
    | Readonly<{ contentFile: SessionHandoffFileSlice; contentBase64?: never }>
  )>[];
}>;

export type SessionHandoffProviderBundle = ClaudeSessionBundle | CodexSessionBundle;

export type ImportedSessionHandoffBundle = Readonly<{
  remoteSessionId: string;
  directSource: DirectSessionsSource;
  agentRuntimeDescriptorV1?: AgentRuntimeDescriptorV1;
  resume: HandoffResumePlan;
}>;
