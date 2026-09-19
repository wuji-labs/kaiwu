import {
    checkMachineFileBrowserDirectory,
    type MachineFileBrowserDirectoryCheck,
} from '@/sync/domains/input/machineFileBrowser';

export type NewSessionPathSelectionSource = 'explicit' | 'route' | 'persisted' | 'recent' | 'home' | 'recovered';

type ResolveNewSessionPathForLaunchInput = Readonly<{
    machineId: string;
    serverId?: string | null;
    selectedPath: string;
    fallbackPaths: ReadonlyArray<string>;
    source: NewSessionPathSelectionSource;
    checkDirectory?: (input: Readonly<{
        machineId: string;
        directoryPath: string;
        serverId?: string | null;
    }>) => Promise<MachineFileBrowserDirectoryCheck>;
}>;

export type ResolveNewSessionPathForLaunchResult = Readonly<{
    path: string;
    recovered: boolean;
}>;

function uniquePaths(paths: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const rawPath of paths) {
        const path = typeof rawPath === 'string' ? rawPath.trim() : '';
        if (!path || seen.has(path)) continue;
        seen.add(path);
        result.push(path);
    }
    return result;
}

export async function resolveNewSessionPathForLaunch(
    input: ResolveNewSessionPathForLaunchInput,
): Promise<ResolveNewSessionPathForLaunchResult> {
    const selectedPath = input.selectedPath.trim();
    if (input.source !== 'recent' || !selectedPath) {
        return { path: selectedPath, recovered: false };
    }

    const checkDirectory = input.checkDirectory ?? checkMachineFileBrowserDirectory;
    const candidates = uniquePaths([selectedPath, ...input.fallbackPaths]);
    for (const candidate of candidates) {
        let check: MachineFileBrowserDirectoryCheck;
        try {
            check = await checkDirectory({
                machineId: input.machineId,
                directoryPath: candidate,
                serverId: input.serverId,
            });
        } catch {
            // A probe failure is not evidence that the user's path is stale. Preserve it and
            // let the normal spawn path return the authoritative machine-side error.
            return { path: selectedPath, recovered: false };
        }
        if (check.status === 'exists') {
            return {
                path: candidate,
                recovered: candidate !== selectedPath,
            };
        }
    }

    // A failed filesystem probe is not permission to rewrite a user-visible path.
    // Keep the original request so the daemon can return its precise final error.
    return { path: selectedPath, recovered: false };
}
