import type { InstallableAutoUpdateMode, InstallableDefaultPolicy } from './installables.js';
export type InstallablePolicyOverride = Readonly<{
    autoInstallWhenNeeded?: boolean;
    autoUpdateMode?: InstallableAutoUpdateMode;
}>;
export declare function resolveInstallablePolicy(params: Readonly<{
    settings: unknown;
    machineId: string;
    installableKey: string;
    defaults: InstallableDefaultPolicy;
}>): InstallableDefaultPolicy;
export declare function applyInstallablePolicyOverride(params: Readonly<{
    prev: Record<string, Record<string, InstallablePolicyOverride>>;
    machineId: string;
    installableKey: string;
    patch: InstallablePolicyOverride;
}>): Record<string, Record<string, InstallablePolicyOverride>>;
//# sourceMappingURL=installablesPolicy.d.ts.map