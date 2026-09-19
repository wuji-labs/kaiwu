import * as React from 'react';

import { resolvePreferredMachineId } from '@/components/settings/pickers/resolvePreferredMachineId';
import { normalizeOptionalParam } from '@/profileRouteParams';
import type { Machine, Session } from '@/sync/domains/state/storageTypes';
import { isMachineOnline } from '@/utils/sessions/machineUtils';
import { useStableRecentPathsResolver } from '@/utils/sessions/useStableRecentPathsForMachine';
import type { NewSessionPathSelectionSource } from './resolveNewSessionPathForLaunch';

type RecentMachinePathsList = Array<{ machineId: string; path: string }>;

type PathSelection = Readonly<{
    path: string;
    source: NewSessionPathSelectionSource;
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

function normalizeMachineIdParam(raw: unknown): string {
    const normalized = normalizeOptionalParam(
        typeof raw === 'string' || Array.isArray(raw) ? raw : undefined,
    );
    return typeof normalized === 'string' ? normalized.trim() : '';
}

function normalizePathParam(raw: unknown): string {
    const normalized = normalizeOptionalParam(
        typeof raw === 'string' || Array.isArray(raw) ? raw : undefined,
    );
    return typeof normalized === 'string' ? normalized.trim() : '';
}

export function useNewSessionMachinePathState(params: Readonly<{
    machines: ReadonlyArray<Machine>;
    recentMachinePaths: unknown;
    sessions?: ReadonlyArray<Session | string> | null | undefined;
    machineIdParam: unknown;
    pathParam: unknown;
    persistedMachineId?: unknown;
    persistedPath?: unknown;
    cacheScopeKey?: string | null;
}>): Readonly<{
    selectedMachineId: string | null;
    setSelectedMachineId: React.Dispatch<React.SetStateAction<string | null>>;
    selectedPath: string;
    setSelectedPath: React.Dispatch<React.SetStateAction<string>>;
    setDraftSelectedPath: (path: string) => void;
    getRequestedPath: () => string;
    getBestPathForMachine: (machineId: string | null) => string;
    getAutomaticPathCandidatesForMachine: (machineId: string | null) => ReadonlyArray<string>;
    selectedPathSource: NewSessionPathSelectionSource;
    setAutomaticPathForMachine: (machineId: string | null) => void;
    setRecoveredPath: (path: string) => void;
}> {
    const recentMachinePaths = React.useMemo((): RecentMachinePathsList => {
        return Array.isArray(params.recentMachinePaths) ? (params.recentMachinePaths as any[]).slice() as any : [];
    }, [params.recentMachinePaths]);
    const resolveRecentPathsForMachine = useStableRecentPathsResolver({
        recentMachinePaths,
        sessions: params.sessions,
        cacheScopeKey: params.cacheScopeKey,
    });

    const resolveMachineId = React.useCallback((preferredMachineId: string | null): string | null => {
        const preferredOnlineMachineId = resolvePreferredMachineId({
            machines: params.machines,
            preferredMachineId,
            recentMachinePaths,
            onlineOnly: true,
        });
        if (preferredOnlineMachineId) return preferredOnlineMachineId;
        return resolvePreferredMachineId({
            machines: params.machines,
            preferredMachineId,
            recentMachinePaths,
        });
    }, [params.machines, recentMachinePaths]);

    const getAutomaticPathCandidatesForMachine = React.useCallback((machineId: string | null): ReadonlyArray<string> => {
        if (!machineId) return [];
        const recent = resolveRecentPathsForMachine(machineId);
        const machine = params.machines.find((m) => m.id === machineId);
        return uniquePaths([
            ...recent,
            typeof machine?.metadata?.homeDir === 'string' ? machine.metadata.homeDir : '',
        ]);
    }, [params.machines, resolveRecentPathsForMachine]);

    const getBestPathForMachine = React.useCallback((machineId: string | null): string => {
        return getAutomaticPathCandidatesForMachine(machineId)[0] ?? '';
    }, [getAutomaticPathCandidatesForMachine]);

    const getPersistedPathForMachine = React.useCallback((machineId: string | null): string => {
        if (!machineId) return '';
        const persistedMachineId = normalizeMachineIdParam(params.persistedMachineId);
        if (!persistedMachineId || persistedMachineId !== machineId) {
            return '';
        }
        return normalizePathParam(params.persistedPath);
    }, [params.persistedMachineId, params.persistedPath]);

    const resolvePathSelectionForMachine = React.useCallback((machineId: string | null, includeRoutePath: boolean): PathSelection => {
        const routePath = includeRoutePath ? normalizePathParam(params.pathParam) : '';
        if (routePath) return { path: routePath, source: 'route' };

        const persistedPath = getPersistedPathForMachine(machineId);
        if (persistedPath) return { path: persistedPath, source: 'persisted' };

        const automaticCandidates = getAutomaticPathCandidatesForMachine(machineId);
        if (automaticCandidates[0]) {
            const recentPaths = resolveRecentPathsForMachine(machineId);
            return {
                path: automaticCandidates[0],
                source: recentPaths.includes(automaticCandidates[0]) ? 'recent' : 'home',
            };
        }

        return { path: '', source: 'home' };
    }, [getAutomaticPathCandidatesForMachine, getPersistedPathForMachine, params.pathParam, resolveRecentPathsForMachine]);

    const resolvePersistedMachineId = React.useCallback((): string | null => {
        const persistedMachineId = normalizeMachineIdParam(params.persistedMachineId);
        if (!persistedMachineId) return null;
        // Persistence hydration can precede the first complete machine snapshot. Once the
        // preferred machine is present, preserve that exact preference; resolveMachineId may
        // otherwise replace it with the first currently-online machine.
        return params.machines.some((machine) => machine.id === persistedMachineId)
            ? persistedMachineId
            : null;
    }, [params.machines, params.persistedMachineId]);

    const [selectedMachineId, setSelectedMachineIdState] = React.useState<string | null>(() => {
        return resolvePersistedMachineId() ?? resolveMachineId(null);
    });
    const selectedMachineIdRef = React.useRef<string | null>(selectedMachineId);
    selectedMachineIdRef.current = selectedMachineId;
    const hasUserSelectedMachineRef = React.useRef(false);
    const selectedMachineOnlineSeenByIdRef = React.useRef<Map<string, boolean>>(new Map());
    const lastAppliedPersistedMachineIdRef = React.useRef<string>('');

    const setSelectedMachineId = React.useCallback<React.Dispatch<React.SetStateAction<string | null>>>((next) => {
        hasUserSelectedMachineRef.current = true;
        setSelectedMachineIdState((current) => typeof next === 'function' ? next(current) : next);
    }, []);

    const initialPathSelection = resolvePathSelectionForMachine(selectedMachineId, true);
    const [selectedPath, setSelectedPathState] = React.useState<string>(() => initialPathSelection.path);
    const [selectedPathSource, setSelectedPathSource] = React.useState<NewSessionPathSelectionSource>(() => initialPathSelection.source);
    const selectedPathDraftRef = React.useRef<string>(selectedPath);
    const hasUserEditedPathRef = React.useRef(false);
    const lastAppliedMachineParamRef = React.useRef<string>('');
    const lastAppliedPathParamRef = React.useRef<string>('');
    const applyCommittedSelectedPath = React.useCallback((nextPath: string, source: NewSessionPathSelectionSource) => {
        selectedPathDraftRef.current = nextPath;
        setSelectedPathSource(source);
        setSelectedPathState(nextPath);
    }, []);

    const setSelectedPath = React.useCallback<React.Dispatch<React.SetStateAction<string>>>((next) => {
        hasUserEditedPathRef.current = true;
        setSelectedPathState((current) => {
            const resolved = typeof next === 'function' ? next(current) : next;
            selectedPathDraftRef.current = resolved;
            setSelectedPathSource('explicit');
            return resolved;
        });
    }, []);
    const setDraftSelectedPath = React.useCallback((path: string) => {
        hasUserEditedPathRef.current = true;
        selectedPathDraftRef.current = path;
        setSelectedPathSource('explicit');
    }, []);
    const getRequestedPath = React.useCallback(() => {
        return selectedPathDraftRef.current;
    }, []);

    const setAutomaticPathForMachine = React.useCallback((machineId: string | null) => {
        const nextPath = getBestPathForMachine(machineId);
        const recentPaths = resolveRecentPathsForMachine(machineId);
        const source: NewSessionPathSelectionSource = nextPath && recentPaths.includes(nextPath) ? 'recent' : 'home';
        hasUserEditedPathRef.current = false;
        selectedPathDraftRef.current = nextPath;
        setSelectedPathSource(source);
        setSelectedPathState(nextPath);
    }, [getBestPathForMachine, resolveRecentPathsForMachine]);

    const setRecoveredPath = React.useCallback((path: string) => {
        const nextPath = path.trim();
        if (!nextPath) return;
        hasUserEditedPathRef.current = false;
        selectedPathDraftRef.current = nextPath;
        setSelectedPathSource('recovered');
        setSelectedPathState(nextPath);
    }, []);

    const hasMachine = React.useCallback((machineId: string | null): boolean => {
        if (!machineId) return false;
        return params.machines.some((machine) => machine.id === machineId);
    }, [params.machines]);

    // Handle machine route param from picker screens (main's navigation pattern)
    React.useEffect(() => {
        const machineId = normalizeMachineIdParam(params.machineIdParam);
        if (!machineId) {
            lastAppliedMachineParamRef.current = '';
            return;
        }
        // Only mark the param "applied" once we've actually applied it. This prevents the initial
        // render from consuming the param before machine snapshots hydrate.
        if (machineId === lastAppliedMachineParamRef.current) {
            return;
        }
        if (!hasMachine(machineId)) {
            return;
        }

        lastAppliedMachineParamRef.current = machineId;
        if (machineId === selectedMachineId) return;
        hasUserSelectedMachineRef.current = true;
        setSelectedMachineIdState(machineId);
        hasUserEditedPathRef.current = false;
        const nextSelection = resolvePathSelectionForMachine(machineId, true);
        applyCommittedSelectedPath(nextSelection.path, nextSelection.source);
    }, [applyCommittedSelectedPath, hasMachine, params.machineIdParam, resolvePathSelectionForMachine, selectedMachineId]);

    React.useEffect(() => {
        const routeMachineId = normalizeMachineIdParam(params.machineIdParam);
        if (routeMachineId) {
            lastAppliedPersistedMachineIdRef.current = '';
            return;
        }
        if (hasUserSelectedMachineRef.current) {
            return;
        }

        const reconciledPersistedMachineId = resolvePersistedMachineId();
        if (!reconciledPersistedMachineId) {
            lastAppliedPersistedMachineIdRef.current = '';
            return;
        }
        if (reconciledPersistedMachineId === lastAppliedPersistedMachineIdRef.current) {
            return;
        }

        lastAppliedPersistedMachineIdRef.current = reconciledPersistedMachineId;
        if (reconciledPersistedMachineId === selectedMachineIdRef.current) {
            return;
        }

        setSelectedMachineIdState(reconciledPersistedMachineId);
        hasUserEditedPathRef.current = false;
        const nextSelection = resolvePathSelectionForMachine(reconciledPersistedMachineId, false);
        applyCommittedSelectedPath(nextSelection.path, nextSelection.source);
    }, [
        applyCommittedSelectedPath,
        params.machineIdParam,
        resolvePathSelectionForMachine,
        resolvePersistedMachineId,
    ]);

    // Ensure a machine is pre-selected once machines have loaded (wizard expects this).
    React.useEffect(() => {
        if (selectedMachineId !== null) return;
        if (params.machines.length === 0) return;
        // Let persisted reconciliation own hydration when its preferred machine is available.
        // Otherwise this fallback can enqueue a competing selection in the same effect flush,
        // causing the persisted effect to run again against a stale selectedMachineId.
        if (resolvePersistedMachineId() !== null) return;
        const machineIdToUse = resolveMachineId(null);
        const nextSelection = resolvePathSelectionForMachine(machineIdToUse, true);

        hasUserSelectedMachineRef.current = false;
        setSelectedMachineIdState(machineIdToUse);
        hasUserEditedPathRef.current = false;
        applyCommittedSelectedPath(nextSelection.path, nextSelection.source);
    }, [applyCommittedSelectedPath, params.machines, resolveMachineId, resolvePathSelectionForMachine, selectedMachineId]);

    // Keep selection valid when machine snapshots change (server/account switch, revoke, reconnect).
    React.useEffect(() => {
        if (selectedMachineId === null) return;
        if (hasMachine(selectedMachineId)) return;

        const machineIdToUse = resolveMachineId(null);
        if (machineIdToUse === selectedMachineId) return;

        hasUserSelectedMachineRef.current = false;
        setSelectedMachineIdState(machineIdToUse);
        hasUserEditedPathRef.current = false;
        const nextSelection = resolvePathSelectionForMachine(machineIdToUse, false);
        applyCommittedSelectedPath(nextSelection.path, nextSelection.source);
    }, [applyCommittedSelectedPath, hasMachine, resolveMachineId, resolvePathSelectionForMachine, selectedMachineId]);

    React.useEffect(() => {
        if (!selectedMachineId) return;
        const machine = params.machines.find((m) => m.id === selectedMachineId);
        if (!machine) return;
        if (!isMachineOnline(machine)) return;
        selectedMachineOnlineSeenByIdRef.current.set(selectedMachineId, true);
    }, [params.machines, selectedMachineId]);

    // If we implicitly selected an offline machine, upgrade to the best available online machine
    // once machine snapshots hydrate. Keep explicit user/route choices stable.
    React.useEffect(() => {
        if (selectedMachineId === null) return;
        if (hasUserSelectedMachineRef.current) return;
        if (normalizeMachineIdParam(params.machineIdParam)) return;
        if (selectedMachineOnlineSeenByIdRef.current.get(selectedMachineId) === true) return;

        const machineIdToUse = resolveMachineId(selectedMachineId);
        if (!machineIdToUse || machineIdToUse === selectedMachineId) return;

        hasUserSelectedMachineRef.current = false;
        setSelectedMachineIdState(machineIdToUse);

        if (hasUserEditedPathRef.current) return;
        hasUserEditedPathRef.current = false;
        const nextSelection = resolvePathSelectionForMachine(machineIdToUse, false);
        applyCommittedSelectedPath(nextSelection.path, nextSelection.source);
    }, [applyCommittedSelectedPath, params.machineIdParam, resolveMachineId, resolvePathSelectionForMachine, selectedMachineId]);

    // Handle path route param from picker screens (main's navigation pattern)
    React.useEffect(() => {
        const trimmedPath = normalizePathParam(params.pathParam);
        const routeMachineId = normalizeMachineIdParam(params.machineIdParam);

        if (routeMachineId && !hasMachine(routeMachineId)) {
            return;
        }

        if (trimmedPath === lastAppliedPathParamRef.current) {
            return;
        }

        lastAppliedPathParamRef.current = trimmedPath;
        if (trimmedPath && trimmedPath !== selectedPath) {
            hasUserEditedPathRef.current = false;
            applyCommittedSelectedPath(trimmedPath, 'route');
        }
    }, [applyCommittedSelectedPath, hasMachine, params.machineIdParam, params.pathParam, selectedPath]);

    React.useEffect(() => {
        if (!selectedMachineId) {
            return;
        }
        if (normalizePathParam(params.pathParam)) {
            return;
        }
        if (hasUserEditedPathRef.current) {
            return;
        }

        const persistedPath = getPersistedPathForMachine(selectedMachineId);
        if (persistedPath) {
            if (selectedPath !== persistedPath) {
                applyCommittedSelectedPath(persistedPath, 'persisted');
            }
            return;
        }

        if (selectedPath.trim().length > 0) {
            return;
        }

        const bestPath = getBestPathForMachine(selectedMachineId);
        if (!bestPath) {
            return;
        }

        const recentPaths = resolveRecentPathsForMachine(selectedMachineId);
        applyCommittedSelectedPath(bestPath, recentPaths.includes(bestPath) ? 'recent' : 'home');
    }, [applyCommittedSelectedPath, getBestPathForMachine, getPersistedPathForMachine, params.pathParam, resolveRecentPathsForMachine, selectedMachineId, selectedPath]);

    return {
        selectedMachineId,
        setSelectedMachineId,
        selectedPath,
        setSelectedPath,
        setDraftSelectedPath,
        getRequestedPath,
        getBestPathForMachine,
        getAutomaticPathCandidatesForMachine,
        selectedPathSource,
        setAutomaticPathForMachine,
        setRecoveredPath,
    };
}
