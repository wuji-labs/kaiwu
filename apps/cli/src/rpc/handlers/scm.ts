import type {
    ScmBackendDescribeRequest,
    ScmBackendDescribeResponse,
    ScmBranchIntegrationRequest,
    ScmBranchIntegrationResponse,
    ScmBranchOperationControlRequest,
    ScmBranchCheckoutRequest,
    ScmBranchCheckoutResponse,
    ScmBranchCreateRequest,
    ScmBranchCreateResponse,
    ScmBranchListRequest,
    ScmBranchListResponse,
    ScmChangeApplyRequest,
    ScmChangeApplyResponse,
    ScmChangeDiscardRequest,
    ScmChangeDiscardResponse,
    ScmCommitBackoutRequest,
    ScmCommitBackoutResponse,
    ScmCommitCreateRequest,
    ScmCommitCreateResponse,
    ScmDiffCommitRequest,
    ScmDiffCommitResponse,
    ScmDiffFileRequest,
    ScmDiffFileResponse,
    ScmLogListRequest,
    ScmLogListResponse,
    ScmRemoteAddRequest,
    ScmRemoteManagementResponse,
    ScmRemoteRemoveRequest,
    ScmRemotePublishRequest,
    ScmRemotePublishResponse,
    ScmRemoteRequest,
    ScmRemoteResponse,
    ScmRemoteSetUrlRequest,
    ScmStashApplyRequest,
    ScmStashApplyResponse,
    ScmStashDropRequest,
    ScmStashDropResponse,
    ScmStashListRequest,
    ScmStashListResponse,
    ScmStashPopRequest,
    ScmStashPopResponse,
    ScmStashShowRequest,
    ScmStashShowResponse,
    ScmStatusSnapshotRequest,
    ScmStatusSnapshotResponse,
    ScmWorktreeCreateRequest,
    ScmWorktreeCreateResponse,
    ScmWorktreePruneRequest,
    ScmWorktreePruneResponse,
    ScmWorktreeRemoveRequest,
    ScmWorktreeRemoveResponse,
    ScmWorktreesEnrichmentRequest,
    ScmWorktreesEnrichmentResponse,
} from '@happier-dev/protocol';
import { RPC_METHODS } from '@happier-dev/protocol/rpc';
import { SCM_OPERATION_ERROR_CODES } from '@happier-dev/protocol';

import type { RpcHandlerRegistrar } from '@/api/rpc/types';
import { logger } from '@/ui/logger';
import {
    createNonRepositoryScmSnapshotResponse,
    notRepositoryResponse,
    runScmRoute,
} from '@/scm/rpc/dispatch';
import type { ScmFilesystemAccessPolicy } from '@/scm/runtime';
import type { ScmConnectedAccountCredentialResolver } from '@/scm/types';

import { registerScmPullRequestHandlers } from './scm/registerScmPullRequestHandlers';
import { registerScmRepositoryProvisioningHandlers } from './scm/registerScmRepositoryProvisioningHandlers';
import type { ScmHandlerRouteBase } from './scm/scmHandlerRouteBase';

/**
 * TTL cache with in-flight coalescing. Concurrent identical requests share one
 * route invocation, and a settled result is reused for `ttlMs`. `invalidate`
 * drops both the cached values and the in-flight entries so a stale response
 * cannot be delivered after a mutating RPC.
 */
type CoalescedTtlCache<TValue> = Readonly<{
    readFresh: (key: string) => TValue | undefined;
    readLastKnown: (key: string) => TValue | undefined;
    invalidate: () => void;
    /**
     * Drop the in-flight load for `key` without discarding the last known value.
     * A load that overran its response deadline must not keep the next poll
     * waiting on it, and its late settlement must not repopulate the cache.
     */
    abandon: (key: string) => void;
    getOrLoad: (key: string, load: () => Promise<TValue>) => Promise<TValue>;
}>;

function createCoalescedTtlCache<TValue>(ttlMs: number): CoalescedTtlCache<TValue> {
    const results = new Map<string, { value: TValue; expiresAtMs: number }>();
    const inFlight = new Map<string, Promise<TValue>>();
    const abandonedEpochByKey = new Map<string, number>();
    let generation = 0;

    const readFresh = (key: string): TValue | undefined => {
        const cached = results.get(key);
        return cached && cached.expiresAtMs > Date.now() ? cached.value : undefined;
    };
    const readLastKnown = (key: string): TValue | undefined => results.get(key)?.value;
    const invalidate = (): void => {
        generation += 1;
        results.clear();
        inFlight.clear();
        abandonedEpochByKey.clear();
    };
    const abandon = (key: string): void => {
        abandonedEpochByKey.set(key, (abandonedEpochByKey.get(key) ?? 0) + 1);
        inFlight.delete(key);
    };
    const getOrLoad = (key: string, load: () => Promise<TValue>): Promise<TValue> => {
        const existing = inFlight.get(key);
        if (existing) return existing;

        const startGeneration = generation;
        const startKeyEpoch = abandonedEpochByKey.get(key) ?? 0;
        const promise = load().then((value) => {
            const stillCurrent = startGeneration === generation
                && startKeyEpoch === (abandonedEpochByKey.get(key) ?? 0);
            if (ttlMs > 0 && stillCurrent) {
                results.set(key, { value, expiresAtMs: Date.now() + ttlMs });
            }
            return value;
        });

        inFlight.set(key, promise);
        const settle = (): void => {
            if (inFlight.get(key) === promise) {
                inFlight.delete(key);
            }
        };
        void promise.then(settle, settle);
        return promise;
    };

    return { readFresh, readLastKnown, invalidate, abandon, getOrLoad };
}

const DEFAULT_SCM_RESPONSE_TIMEOUT_MS = 15_000;

function readNonNegativeIntEnv(name: string, fallback: number): number {
    const raw = (process.env[name] ?? '').trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Bounds the daemon-side wait for a snapshot/enrichment route. Callers get a
 * bounded-projection fallback instead of blocking the event-loop-facing RPC.
 * The timeout handler is expected to abandon the overrunning load so it neither
 * blocks the next poll nor repopulates the cache when it eventually settles.
 */
async function withResponseTimeout<TValue>(
    promise: Promise<TValue>,
    timeoutMs: number,
    onTimeout: () => TValue,
): Promise<TValue> {
    if (timeoutMs <= 0) return await promise;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<TValue>((resolve) => {
                timeoutId = setTimeout(() => resolve(onTimeout()), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}

export function registerScmHandlers(
    rpcHandlerManager: RpcHandlerRegistrar,
    workingDirectory: string,
    deps?: Readonly<{
        accessPolicy?: ScmFilesystemAccessPolicy;
        connectedAccounts?: ScmConnectedAccountCredentialResolver;
    }>
): void {
    const routeBase: ScmHandlerRouteBase = {
        workingDirectory,
        accessPolicy: deps?.accessPolicy,
        connectedAccounts: deps?.connectedAccounts,
    };
    const statusSnapshotCache = createCoalescedTtlCache<ScmStatusSnapshotResponse>(
        readNonNegativeIntEnv(
            'HAPPIER_SCM_STATUS_SNAPSHOT_MIN_INTERVAL_MS',
            readNonNegativeIntEnv('HAPPIER_SCM_STATUS_SNAPSHOT_CACHE_TTL_MS', 1_000),
        ),
    );
    const statusSnapshotTimeoutMs = readNonNegativeIntEnv(
        'HAPPIER_SCM_STATUS_SNAPSHOT_TIMEOUT_MS',
        DEFAULT_SCM_RESPONSE_TIMEOUT_MS,
    );
    // Enrichment is background augmentation of the worktree picker, not the
    // foreground status read, so its minimum execution interval is minutes rather
    // than seconds; the git backend additionally skips the scan entirely when no
    // worktree state changed.
    const worktreesEnrichmentCache = createCoalescedTtlCache<ScmWorktreesEnrichmentResponse>(
        readNonNegativeIntEnv(
            'HAPPIER_SCM_WORKTREES_ENRICHMENT_MIN_INTERVAL_MS',
            readNonNegativeIntEnv('HAPPIER_SCM_WORKTREES_ENRICHMENT_CACHE_TTL_MS', 300_000),
        ),
    );
    const worktreesEnrichmentTimeoutMs = readNonNegativeIntEnv(
        'HAPPIER_SCM_WORKTREES_ENRICHMENT_TIMEOUT_MS',
        DEFAULT_SCM_RESPONSE_TIMEOUT_MS,
    );

    const invalidateScmCaches = (): void => {
        statusSnapshotCache.invalidate();
        worktreesEnrichmentCache.invalidate();
    };
    const runWithScmCacheInvalidation = async <TResponse,>(
        run: () => Promise<TResponse>,
    ): Promise<TResponse> => {
        invalidateScmCaches();
        try {
            return await run();
        } finally {
            invalidateScmCaches();
        }
    };
    const statusSnapshotKey = (request: ScmStatusSnapshotRequest): string => JSON.stringify({
        cwd: request.cwd ?? null,
        backendPreference: request.backendPreference ?? null,
        includeWorktreeStatus: request.includeWorktreeStatus === true,
    });
    const runStatusSnapshot = async (request: ScmStatusSnapshotRequest): Promise<ScmStatusSnapshotResponse> => {
        const key = statusSnapshotKey(request);
        const cached = statusSnapshotCache.readFresh(key);
        if (cached !== undefined) return cached;

        const promise = statusSnapshotCache.getOrLoad(key, () =>
            runScmRoute<ScmStatusSnapshotRequest, ScmStatusSnapshotResponse>({
                request,
                ...routeBase,
                onNonRepository: async ({ cwd }) =>
                    createNonRepositoryScmSnapshotResponse({
                        workingDirectory,
                        cwd,
                    }),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.statusSnapshot({ context, request }),
            })
        );

        return await withResponseTimeout(promise, statusSnapshotTimeoutMs, () => {
            statusSnapshotCache.abandon(key);
            logger.warn('SCM status snapshot timed out; returning the last known response', {
                timeoutMs: statusSnapshotTimeoutMs,
                key,
            });
            return statusSnapshotCache.readLastKnown(key) ?? {
                success: false,
                errorCode: SCM_OPERATION_ERROR_CODES.COMMAND_FAILED,
                error: 'SCM status snapshot timed out',
            };
        });
    };

    const worktreesEnrichmentKey = (request: ScmWorktreesEnrichmentRequest): string => JSON.stringify({
        cwd: request.cwd ?? null,
        backendPreference: request.backendPreference ?? null,
        worktreePaths: request.worktreePaths ?? [],
    });
    const runWorktreesEnrichment = async (
        request: ScmWorktreesEnrichmentRequest,
    ): Promise<ScmWorktreesEnrichmentResponse> => {
        const key = worktreesEnrichmentKey(request);
        const cached = worktreesEnrichmentCache.readFresh(key);
        if (cached !== undefined) return cached;

        const promise = worktreesEnrichmentCache.getOrLoad(key, () =>
            runScmRoute<ScmWorktreesEnrichmentRequest, ScmWorktreesEnrichmentResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => ({ success: true, worktrees: [] }),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.worktreesEnrichment({ context, request }),
            })
        );

        return await withResponseTimeout(promise, worktreesEnrichmentTimeoutMs, () => {
            worktreesEnrichmentCache.abandon(key);
            logger.warn('SCM worktrees enrichment timed out; returning a path-only response', {
                timeoutMs: worktreesEnrichmentTimeoutMs,
                key,
            });
            return worktreesEnrichmentCache.readLastKnown(key) ?? {
                // Bounded projection: keep the picker usable with the paths the
                // caller already knows; per-worktree metrics are simply omitted.
                success: true,
                worktrees: (request.worktreePaths ?? []).map((path) => ({ path })),
            };
        });
    };

    rpcHandlerManager.registerHandler<ScmBackendDescribeRequest, ScmBackendDescribeResponse>(
        RPC_METHODS.SCM_BACKEND_DESCRIBE,
        async (request) =>
            runScmRoute<ScmBackendDescribeRequest, ScmBackendDescribeResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => ({ success: true, isRepo: false }),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.describeBackend({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmStatusSnapshotRequest, ScmStatusSnapshotResponse>(
        RPC_METHODS.SCM_STATUS_SNAPSHOT,
        async (request) => runStatusSnapshot(request)
    );

    rpcHandlerManager.registerHandler<ScmDiffFileRequest, ScmDiffFileResponse>(
        RPC_METHODS.SCM_DIFF_FILE,
        async (request) =>
            runScmRoute<ScmDiffFileRequest, ScmDiffFileResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmDiffFileResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.diffFile({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmDiffCommitRequest, ScmDiffCommitResponse>(
        RPC_METHODS.SCM_DIFF_COMMIT,
        async (request) =>
            runScmRoute<ScmDiffCommitRequest, ScmDiffCommitResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmDiffCommitResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.diffCommit({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmChangeApplyRequest, ScmChangeApplyResponse>(
        RPC_METHODS.SCM_CHANGE_INCLUDE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmChangeApplyRequest, ScmChangeApplyResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmChangeApplyResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.changeInclude({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmChangeApplyRequest, ScmChangeApplyResponse>(
        RPC_METHODS.SCM_CHANGE_EXCLUDE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmChangeApplyRequest, ScmChangeApplyResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmChangeApplyResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.changeExclude({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmChangeDiscardRequest, ScmChangeDiscardResponse>(
        RPC_METHODS.SCM_CHANGE_DISCARD,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmChangeDiscardRequest, ScmChangeDiscardResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmChangeDiscardResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.changeDiscard({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmCommitCreateRequest, ScmCommitCreateResponse>(
        RPC_METHODS.SCM_COMMIT_CREATE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmCommitCreateRequest, ScmCommitCreateResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmCommitCreateResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.commitCreate({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmLogListRequest, ScmLogListResponse>(
        RPC_METHODS.SCM_LOG_LIST,
        async (request) =>
            runScmRoute<ScmLogListRequest, ScmLogListResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmLogListResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.logList({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmBranchListRequest, ScmBranchListResponse>(
        RPC_METHODS.SCM_BRANCH_LIST,
        async (request) =>
            runScmRoute<ScmBranchListRequest, ScmBranchListResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmBranchListResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.branchList({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmBranchCreateRequest, ScmBranchCreateResponse>(
        RPC_METHODS.SCM_BRANCH_CREATE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchCreateRequest, ScmBranchCreateResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchCreateResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchCreate({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmBranchCheckoutRequest, ScmBranchCheckoutResponse>(
        RPC_METHODS.SCM_BRANCH_CHECKOUT,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchCheckoutRequest, ScmBranchCheckoutResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchCheckoutResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchCheckout({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmBranchIntegrationRequest, ScmBranchIntegrationResponse>(
        RPC_METHODS.SCM_BRANCH_MERGE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchIntegrationRequest, ScmBranchIntegrationResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchIntegrationResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchMerge({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmBranchIntegrationRequest, ScmBranchIntegrationResponse>(
        RPC_METHODS.SCM_BRANCH_REBASE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchIntegrationRequest, ScmBranchIntegrationResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchIntegrationResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchRebase({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmBranchOperationControlRequest, ScmBranchIntegrationResponse>(
        RPC_METHODS.SCM_BRANCH_OPERATION_CONTINUE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchOperationControlRequest, ScmBranchIntegrationResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchIntegrationResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchOperationContinue({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmBranchOperationControlRequest, ScmBranchIntegrationResponse>(
        RPC_METHODS.SCM_BRANCH_OPERATION_ABORT,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmBranchOperationControlRequest, ScmBranchIntegrationResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmBranchIntegrationResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.branchOperationAbort({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmWorktreeCreateRequest, ScmWorktreeCreateResponse>(
        RPC_METHODS.SCM_WORKTREE_CREATE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmWorktreeCreateRequest, ScmWorktreeCreateResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmWorktreeCreateResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.worktreeCreate({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmWorktreeRemoveRequest, ScmWorktreeRemoveResponse>(
        RPC_METHODS.SCM_WORKTREE_REMOVE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmWorktreeRemoveRequest, ScmWorktreeRemoveResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmWorktreeRemoveResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.worktreeRemove({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmWorktreePruneRequest, ScmWorktreePruneResponse>(
        RPC_METHODS.SCM_WORKTREE_PRUNE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmWorktreePruneRequest, ScmWorktreePruneResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmWorktreePruneResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.worktreePrune({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmWorktreesEnrichmentRequest, ScmWorktreesEnrichmentResponse>(
        RPC_METHODS.SCM_WORKTREES_ENRICHMENT,
        async (request) => runWorktreesEnrichment(request)
    );

    rpcHandlerManager.registerHandler<ScmCommitBackoutRequest, ScmCommitBackoutResponse>(
        RPC_METHODS.SCM_COMMIT_BACKOUT,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmCommitBackoutRequest, ScmCommitBackoutResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmCommitBackoutResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.commitBackout({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteAddRequest, ScmRemoteManagementResponse>(
        RPC_METHODS.SCM_REMOTE_ADD,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteAddRequest, ScmRemoteManagementResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteManagementResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remoteAdd({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteSetUrlRequest, ScmRemoteManagementResponse>(
        RPC_METHODS.SCM_REMOTE_SET_URL,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteSetUrlRequest, ScmRemoteManagementResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteManagementResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remoteSetUrl({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteRemoveRequest, ScmRemoteManagementResponse>(
        RPC_METHODS.SCM_REMOTE_REMOVE,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteRemoveRequest, ScmRemoteManagementResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteManagementResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remoteRemove({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteRequest, ScmRemoteResponse>(
        RPC_METHODS.SCM_REMOTE_FETCH,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteRequest, ScmRemoteResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remoteFetch({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteRequest, ScmRemoteResponse>(
        RPC_METHODS.SCM_REMOTE_PUSH,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteRequest, ScmRemoteResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remotePush({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemoteRequest, ScmRemoteResponse>(
        RPC_METHODS.SCM_REMOTE_PULL,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemoteRequest, ScmRemoteResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemoteResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remotePull({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmRemotePublishRequest, ScmRemotePublishResponse>(
        RPC_METHODS.SCM_REMOTE_PUBLISH,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmRemotePublishRequest, ScmRemotePublishResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmRemotePublishResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.remotePublish({ context, request }),
                })
            )
    );

    registerScmRepositoryProvisioningHandlers(
        rpcHandlerManager,
        routeBase,
        runWithScmCacheInvalidation
    );
    registerScmPullRequestHandlers(
        rpcHandlerManager,
        routeBase,
        runWithScmCacheInvalidation
    );

    rpcHandlerManager.registerHandler<ScmStashListRequest, ScmStashListResponse>(
        RPC_METHODS.SCM_STASH_LIST,
        async (request) =>
            runScmRoute<ScmStashListRequest, ScmStashListResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmStashListResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.stashList({ context, request }),
            })
    );

    rpcHandlerManager.registerHandler<ScmStashDropRequest, ScmStashDropResponse>(
        RPC_METHODS.SCM_STASH_DROP,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmStashDropRequest, ScmStashDropResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmStashDropResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.stashDrop({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmStashPopRequest, ScmStashPopResponse>(
        RPC_METHODS.SCM_STASH_POP,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmStashPopRequest, ScmStashPopResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmStashPopResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.stashPop({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmStashApplyRequest, ScmStashApplyResponse>(
        RPC_METHODS.SCM_STASH_APPLY,
        async (request) =>
            runWithScmCacheInvalidation(() =>
                runScmRoute<ScmStashApplyRequest, ScmStashApplyResponse>({
                    request,
                    ...routeBase,
                    onNonRepository: async () => notRepositoryResponse<ScmStashApplyResponse>(),
                    runWithBackend: ({ context, selection }) =>
                        selection.backend.stashApply({ context, request }),
                })
            )
    );

    rpcHandlerManager.registerHandler<ScmStashShowRequest, ScmStashShowResponse>(
        RPC_METHODS.SCM_STASH_SHOW,
        async (request) =>
            runScmRoute<ScmStashShowRequest, ScmStashShowResponse>({
                request,
                ...routeBase,
                onNonRepository: async () => notRepositoryResponse<ScmStashShowResponse>(),
                runWithBackend: ({ context, selection }) =>
                    selection.backend.stashShow({ context, request }),
            })
    );
}
