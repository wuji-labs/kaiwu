export interface OtaServerConfig {
  port: number;
  dataDir: string;
  privateKeyPath: string;
  publicBaseUrl: string;
}

export interface ManifestAsset {
  hash: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

export interface ExpoManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
  metadata: Record<string, unknown>;
  extra: Record<string, unknown>;
}

export interface RollbackDirective {
  type: 'rollBackToEmbedded';
  parameters: {
    commitTime: string;
  };
}

export interface CurrentPointer {
  updateId?: string;
  rollback?: boolean;
  commitTime?: string;
  createdAt?: string;
  channel?: string;
  runtimeVersion?: string;
  platform?: string;
  message?: string;
}

export interface ExportMetadataFile {
  version?: number;
  bundler?: string;
  fileMetadata?: {
    ios?: {
      bundle: string;
      assets: Array<{ path: string; ext: string }>;
    };
    android?: {
      bundle: string;
      assets: Array<{ path: string; ext: string }>;
    };
  };
}
