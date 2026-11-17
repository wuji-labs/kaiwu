import type { AgentId } from '../types.js';
import { parseBooleanEnv } from '@happier-dev/protocol';

export type ProviderCliSourcePreference = 'system-first' | 'managed-first';
export type ProviderCliManualInstallKind = 'command' | 'vendor_recipe' | 'none';
export type ProviderCliInstallPlatform = 'darwin' | 'linux' | 'win32';

export type ProviderCliInstallCommand = Readonly<{
  cmd: string;
  args: ReadonlyArray<string>;
  requiresAdmin?: boolean;
  note?: string | null;
}>;

export type ProviderCliManualInstallRecipes =
  | Partial<Record<ProviderCliInstallPlatform, ReadonlyArray<ProviderCliInstallCommand>>>
  | null;

export type ProviderCliArchiveExtractionLimits = Readonly<{
  maxFileBytes: number;
  maxExpandedBytes: number;
}>;

export type ProviderCliManagedArchiveEntry = Readonly<{
  archivePath: string;
  destinationPath: string;
}>;

export type ProviderCliManagedAssetNameByPlatform = Readonly<
  Record<ProviderCliInstallPlatform, Readonly<Record<'arm64' | 'x64', string>>>
>;

export type ProviderCliManagedInstallSpec =
  | Readonly<{
      kind: 'github_release_binary';
      githubRepo: string;
      binaryName: string;
      assetNameByPlatform?: ProviderCliManagedAssetNameByPlatform;
      archiveEntriesByPlatform?: Readonly<
        Record<ProviderCliInstallPlatform, ReadonlyArray<ProviderCliManagedArchiveEntry>>
      >;
      archiveExtractionLimits?: ProviderCliArchiveExtractionLimits;
    }>
  | Readonly<{
      kind: 'managed_package';
      packageName: string;
      binaryName: string;
      packageBinarySetup?: Readonly<{ kind: 'opencode_platform_binary' }> | null;
    }>;

export type ProviderCliKnownCommandCandidate =
  | Readonly<{
      kind: 'homeBinDir';
      relativeDir: string;
    }>
  | Readonly<{
      kind: 'homePath';
      relativePath: string;
    }>
  | Readonly<{
      kind: 'absolutePath';
      path: string;
    }>
  | Readonly<{
      kind: 'homeVersionedDir';
      relativeDir: string;
    }>;

export type ProviderCliAlternativeBinaryIdentityProbe = Readonly<{
  args: ReadonlyArray<string>;
  timeoutMs: number;
  stdoutJsonStringField: string;
}>;

export type ProviderCliRuntimeSpec = Readonly<{
  id: AgentId;
  title: string;
  binaryName: string;
  alternativeBinaryNames?: ReadonlyArray<string>;
  alternativeBinaryFallbackEnabledEnvVar?: string | null;
  alternativeBinaryIdentityProbe?: ProviderCliAlternativeBinaryIdentityProbe | null;
  knownCommandCandidates?: ReadonlyArray<ProviderCliKnownCommandCandidate> | null;
  sourcePreferenceDefault: ProviderCliSourcePreference;
  managedInstall: ProviderCliManagedInstallSpec | null;
  manualInstallKind: ProviderCliManualInstallKind;
  manualInstallRecipes: ProviderCliManualInstallRecipes;
  acceptsJavaScriptFileOverride: boolean;
  installGuideUrl?: string | null;
  docsUrl?: string | null;
}>;

function bashCurlPipe(url: string): ProviderCliInstallCommand {
  return { cmd: 'bash', args: ['-lc', `curl -fsSL ${url} | bash`] };
}

function powershellInstall(command: string): ProviderCliInstallCommand {
  return {
    cmd: 'powershell',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
  };
}

export const PROVIDER_CLI_RUNTIME_SPECS: Readonly<Record<AgentId, ProviderCliRuntimeSpec>> = {
  claude: {
    id: 'claude',
    title: 'Claude Code CLI',
    binaryName: 'claude',
    knownCommandCandidates: [
      { kind: 'homeBinDir', relativeDir: '.local/bin' },
      { kind: 'homeVersionedDir', relativeDir: '.local/share/claude/versions' },
      { kind: 'homePath', relativePath: '.claude/local/cli.js' },
      { kind: 'absolutePath', path: '/opt/homebrew/bin/claude' },
      { kind: 'absolutePath', path: '/usr/local/bin/claude' },
      { kind: 'absolutePath', path: '/home/linuxbrew/.linuxbrew/bin/claude' },
      { kind: 'homePath', relativePath: '.bun/bin/claude' },
      { kind: 'homePath', relativePath: 'AppData/Local/Claude/claude.exe' },
      { kind: 'homeVersionedDir', relativeDir: 'AppData/Local/Claude/versions' },
      { kind: 'homePath', relativePath: '.claude/claude.exe' },
      { kind: 'homeVersionedDir', relativeDir: '.claude/versions' },
      { kind: 'homePath', relativePath: '.local/bin/claude.exe' },
    ],
    sourcePreferenceDefault: 'system-first',
    managedInstall: null,
    manualInstallKind: 'vendor_recipe',
    manualInstallRecipes: {
      darwin: [bashCurlPipe('https://claude.ai/install.sh')],
      linux: [bashCurlPipe('https://claude.ai/install.sh')],
      win32: [powershellInstall('irm https://claude.ai/install.ps1 | iex')],
    },
    acceptsJavaScriptFileOverride: true,
    installGuideUrl: 'https://code.claude.com/docs/en/setup',
    docsUrl: 'https://claude.ai',
  },
  codex: {
    id: 'codex',
    title: 'OpenAI Codex CLI',
    binaryName: 'codex',
    knownCommandCandidates: null,
    sourcePreferenceDefault: 'system-first',
    managedInstall: {
      kind: 'github_release_binary',
      githubRepo: 'openai/codex',
      binaryName: 'codex',
      assetNameByPlatform: {
        darwin: {
          arm64: 'codex-package-aarch64-apple-darwin.tar.gz',
          x64: 'codex-package-x86_64-apple-darwin.tar.gz',
        },
        linux: {
          arm64: 'codex-package-aarch64-unknown-linux-musl.tar.gz',
          x64: 'codex-package-x86_64-unknown-linux-musl.tar.gz',
        },
        win32: {
          arm64: 'codex-package-aarch64-pc-windows-msvc.tar.gz',
          x64: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
        },
      },
      // OpenAI Codex rust-v0.147.0's canonical package layout. Keep this an
      // explicit runtime allowlist: package metadata, rg, and other bundled
      // files are not part of Happier's managed provider installation.
      archiveEntriesByPlatform: {
        darwin: [
          { archivePath: 'bin/codex', destinationPath: 'bin/codex' },
          { archivePath: 'bin/codex-code-mode-host', destinationPath: 'bin/codex-code-mode-host' },
        ],
        linux: [
          { archivePath: 'bin/codex', destinationPath: 'bin/codex' },
          { archivePath: 'bin/codex-code-mode-host', destinationPath: 'bin/codex-code-mode-host' },
        ],
        win32: [
          { archivePath: 'bin/codex.exe', destinationPath: 'bin/codex.exe' },
          { archivePath: 'bin/codex-code-mode-host.exe', destinationPath: 'bin/codex-code-mode-host.exe' },
          {
            archivePath: 'codex-resources/codex-command-runner.exe',
            destinationPath: 'codex-resources/codex-command-runner.exe',
          },
          {
            archivePath: 'codex-resources/codex-windows-sandbox-setup.exe',
            destinationPath: 'codex-resources/codex-windows-sandbox-setup.exe',
          },
        ],
      },
      // OpenAI Codex rust-v0.147.0's checksum-pinned x64 Windows package
      // expands to 370,442,135 bytes, including one 298,668,336-byte
      // executable. rust-v0.167.0 (codex.exe 369,062,704 B + code-mode-host
      // 80,328,496 B + resources) and rust-v0.169.0 both exceed the former
      // 384 MiB ceiling, breaking fresh provider installs (2026-11-15 local
      // incident). A 512 MiB ceiling restores bounded headroom while keeping
      // generic archive, entry-count, path, and compression-ratio protections.
      archiveExtractionLimits: {
        maxFileBytes: 512 * 1024 * 1024,
        maxExpandedBytes: 512 * 1024 * 1024,
      },
    },
    manualInstallKind: 'command',
    manualInstallRecipes: null,
    acceptsJavaScriptFileOverride: false,
    installGuideUrl: null,
    docsUrl: 'https://github.com/openai/codex',
  },
  gemini: {
    id: 'gemini',
    title: 'Google Gemini CLI',
    binaryName: 'gemini',
    knownCommandCandidates: null,
    sourcePreferenceDefault: 'system-first',
    managedInstall: {
      kind: 'managed_package',
      packageName: '@google/gemini-cli',
      binaryName: 'gemini',
    },
    manualInstallKind: 'command',
    manualInstallRecipes: null,
    acceptsJavaScriptFileOverride: false,
    docsUrl: 'https://goo.gle/gemini-cli-auth-docs',
  },
  customAcp: {
    id: 'customAcp',
    title: 'Custom ACP',
    binaryName: 'custom-acp',
    knownCommandCandidates: null,
    sourcePreferenceDefault: 'system-first',
    managedInstall: null,
    manualInstallKind: 'none',
    manualInstallRecipes: null,
    acceptsJavaScriptFileOverride: false,
    docsUrl: null,
  },
} as const;

export function getProviderCliRuntimeSpec(id: AgentId): ProviderCliRuntimeSpec {
  return PROVIDER_CLI_RUNTIME_SPECS[id];
}

export function getProviderCliBinaryNames(
  id: AgentId,
  processEnv: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> {
  const runtimeSpec = getProviderCliRuntimeSpec(id);
  const fallbackEnabled = runtimeSpec.alternativeBinaryFallbackEnabledEnvVar
    ? parseBooleanEnv(processEnv[runtimeSpec.alternativeBinaryFallbackEnabledEnvVar], true)
    : true;
  return [
    runtimeSpec.binaryName,
    ...(fallbackEnabled ? (runtimeSpec.alternativeBinaryNames ?? []) : []),
  ];
}
