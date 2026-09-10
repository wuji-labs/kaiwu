import type { CapabilityId } from './capabilities.js';
import { CODEX_ACP_DEP_ID, CODEX_ACP_DIST_TAG } from './providers/codex/installables.js';
import { GH_BINARY_NAME, GH_DEP_ID, GH_GITHUB_REPO } from './providers/github/installables.js';
export { CODEX_ACP_DEP_ID, CODEX_ACP_DIST_TAG, GH_BINARY_NAME, GH_DEP_ID, GH_GITHUB_REPO, };
export declare const INSTALLABLE_KEYS: {
    readonly CODEX_ACP: "codex-acp";
    readonly GH: "gh";
};
export type InstallableKey = typeof INSTALLABLE_KEYS[keyof typeof INSTALLABLE_KEYS];
export type InstallableKind = 'dep';
export type InstallableSourceKind = 'github_release_binary' | 'managed_package' | 'vendor_recipe' | 'manual_only';
export type InstallableAutoUpdateMode = 'off' | 'notify' | 'auto';
export type InstallableDefaultPolicy = Readonly<{
    autoInstallWhenNeeded: boolean;
    autoUpdateMode: InstallableAutoUpdateMode;
}>;
export type InstallableCatalogEntry = Readonly<{
    key: string;
    kind: InstallableKind;
    capabilityId: Extract<CapabilityId, `dep.${string}`>;
    sourceKind: InstallableSourceKind;
    source?: Readonly<{
        githubRepo?: string;
        binaryName?: string;
        assetPattern?: string;
    }>;
    fallbackInstall?: Readonly<{
        kind: InstallableSourceKind;
        recipes?: Partial<Record<string, string>>;
    }>;
    defaultPolicy: InstallableDefaultPolicy;
    experimental: boolean;
}>;
export declare const INSTALLABLES_CATALOG: readonly [{
    readonly key: "codex-acp";
    readonly kind: "dep";
    readonly capabilityId: "dep.codex-acp";
    readonly sourceKind: "github_release_binary";
    readonly defaultPolicy: Readonly<{
        autoInstallWhenNeeded: boolean;
        autoUpdateMode: InstallableAutoUpdateMode;
    }>;
    readonly experimental: true;
}, {
    readonly key: "gh";
    readonly kind: "dep";
    readonly capabilityId: "dep.gh";
    readonly sourceKind: "github_release_binary";
    readonly source: {
        readonly githubRepo: "cli/cli";
        readonly binaryName: "gh";
        readonly assetPattern: "gh_*_<platform>_<arch>.<archive>";
    };
    readonly fallbackInstall: {
        readonly kind: "managed_package";
        readonly recipes: {
            readonly darwin: "brew install gh";
            readonly linux: "Use your distribution package manager to install GitHub CLI.";
            readonly win32: "winget install GitHub.cli";
        };
    };
    readonly defaultPolicy: Readonly<{
        autoInstallWhenNeeded: boolean;
        autoUpdateMode: InstallableAutoUpdateMode;
    }>;
    readonly experimental: false;
}];
//# sourceMappingURL=installables.d.ts.map