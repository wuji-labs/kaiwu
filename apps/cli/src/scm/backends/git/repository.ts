import type { ScmRepoDetection, ScmBackendContext } from '../../types';
import type {
    ScmStatusSnapshotRequest,
    ScmStatusSnapshotResponse,
    ScmWorktreesEnrichmentRequest,
    ScmWorktreesEnrichmentResponse,
} from '@happier-dev/protocol';
import { SCM_OPERATION_ERROR_CODES } from '@happier-dev/protocol';

import { runScmCommand } from '../../runtime';
import { normalizeRepoRootRelativePath } from '../../runtime';
import { buildGitSnapshot, resolveGitHostingProviderFromOutputs } from './statusSnapshot';
import { parseGitStatusPorcelainV2Z } from './statusParser';
import { inspectGitCheckoutIdentity } from './checkoutIdentity';
import { readGitBranchOperationState } from './operations/branchOperationState';
import { defaultPrStatusCache } from '../../hostingProviders/prStatusCache';
import { resolveHostingAuthProfileKey } from './operations/pullRequestOperationHelpers';
import { enrichGitWorktreesWithStatus, readWorktreeStatusEnrichmentForPaths } from './worktreeStatusEnricher';
import { parseGitWorktreeListPorcelain } from './worktreeListParser';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const UNTRACKED_STATS_MAX_FILES = 128;
const UNTRACKED_STATS_MAX_BYTES = 5_000_000;
const UNTRACKED_STATS_MAX_TOTAL_BYTES = 2_000_000;
const GIT_STATUS_TOTAL_TIMEOUT_MS = 5_000;
const GIT_STATUS_TIMEOUT_MS = 2_500;
const GIT_TRACKED_STATUS_TIMEOUT_MS = 2_500;
const GIT_AHEAD_BEHIND_TIMEOUT_MS = 2_000;
const GIT_STATUS_DEGRADED_THRESHOLD_MS = 1_500;
const GIT_STATUS_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const GIT_READ_ONLY_ENV = {
    GIT_OPTIONAL_LOCKS: '0',
};

function countTextLines(buffer: Buffer): number {
    if (buffer.length === 0) return 0;
    let lines = 1;
    for (let i = 0; i < buffer.length; i += 1) {
        if (buffer[i] === 10) lines += 1;
    }
    return lines;
}

async function computeUntrackedStatsByPath(
    repoRoot: string,
    untrackedPaths: readonly string[],
): Promise<Record<string, { pendingAdded: number; isBinary: boolean }>> {
    const paths = untrackedPaths.slice(0, UNTRACKED_STATS_MAX_FILES);
    const statsByPath: Record<string, { pendingAdded: number; isBinary: boolean }> = {};
    let remainingBytes = UNTRACKED_STATS_MAX_TOTAL_BYTES;

    for (const rawPath of paths) {
        if (remainingBytes <= 0) break;
        const normalized = normalizeRepoRootRelativePath(rawPath);
        if (!normalized.ok) continue;
        if (normalized.relativePath === '.' || normalized.relativePath.trim() === '') continue;

        const absPath = join(repoRoot, normalized.relativePath);
        try {
            const info = await stat(absPath);
            if (!info.isFile()) continue;
            if (info.size > UNTRACKED_STATS_MAX_BYTES || info.size > remainingBytes) {
                statsByPath[normalized.relativePath] = { pendingAdded: 0, isBinary: true };
                continue;
            }

            const buf = await readFile(absPath);
            remainingBytes -= buf.byteLength;
            const isBinary = buf.includes(0);
            statsByPath[normalized.relativePath] = {
                pendingAdded: isBinary ? 0 : countTextLines(buf),
                isBinary,
            };
        } catch {
            // Ignore unreadable files (permissions/races).
        }
    }

    return statsByPath;
}

async function readGitAheadBehind(input: Readonly<{
    cwd: string;
    hasUpstream: boolean;
}>): Promise<{ ahead: number; behind: number } | null> {
    if (!input.hasUpstream) return null;

    const result = await runScmCommand({
        bin: 'git',
        cwd: input.cwd,
        args: ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
        timeoutMs: GIT_AHEAD_BEHIND_TIMEOUT_MS,
        env: GIT_READ_ONLY_ENV,
    });
    if (!result.success) return null;

    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(result.stdout.trim());
    if (!match) return null;
    return {
        ahead: Number(match[1] ?? 0),
        behind: Number(match[2] ?? 0),
    };
}

function resolveMainWorktreePathFromCheckoutIdentity(
    checkoutIdentity: Awaited<ReturnType<typeof inspectGitCheckoutIdentity>>,
): string | null {
    if (!checkoutIdentity) {
        return null;
    }

    return dirname(checkoutIdentity.commonDirPath);
}

export async function detectGitRepo(input: { cwd: string }): Promise<ScmRepoDetection> {
    const gitRepoCheck = await runScmCommand({
        bin: 'git',
        cwd: input.cwd,
        args: ['rev-parse', '--is-inside-work-tree'],
        timeoutMs: 5000,
    });
    if (!gitRepoCheck.success || gitRepoCheck.exitCode !== 0) {
        return {
            isRepo: false,
            rootPath: null,
            mode: null,
        };
    }

    const rootResult = await runScmCommand({
        bin: 'git',
        cwd: input.cwd,
        args: ['rev-parse', '--show-toplevel'],
        timeoutMs: 5000,
    });

    return {
        isRepo: true,
        rootPath: rootResult.success ? rootResult.stdout.trim() : null,
        mode: '.git',
    };
}

export async function getGitSnapshot(input: {
    context: ScmBackendContext;
    request?: Pick<ScmStatusSnapshotRequest, 'includeWorktreeStatus'>;
}): Promise<ScmStatusSnapshotResponse> {
    const { context, request } = input;
    const repoRoot = context.detection.rootPath ?? context.cwd;

    const statusArgs = ['status', '--porcelain=v2', '-z', '--branch', '--show-stash', '--untracked-files=normal', '--no-ahead-behind'];
    const statusStartedAt = Date.now();
    let statusWasDegraded = false;
    let statusResult = await runScmCommand({
        bin: 'git',
        cwd: context.cwd,
        args: statusArgs,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputBytes: GIT_STATUS_MAX_OUTPUT_BYTES,
        env: GIT_READ_ONLY_ENV,
    });

    // A large worktree can make Git's untracked walk exceed the availability
    // budget. Retry once without untracked enumeration so tracked changes and
    // branch metadata remain available without monopolising the daemon.
    if (!statusResult.success && (statusResult.timedOut || statusResult.outputLimitExceeded)) {
        statusWasDegraded = true;
        const remainingBudgetMs = GIT_STATUS_TOTAL_TIMEOUT_MS - (Date.now() - statusStartedAt);
        if (remainingBudgetMs > 0) {
            statusResult = await runScmCommand({
                bin: 'git',
                cwd: context.cwd,
                args: ['status', '--porcelain=v2', '-z', '--branch', '--show-stash', '--untracked-files=no', '--no-ahead-behind'],
                timeoutMs: Math.min(GIT_TRACKED_STATUS_TIMEOUT_MS, remainingBudgetMs),
                maxOutputBytes: GIT_STATUS_MAX_OUTPUT_BYTES,
                env: GIT_READ_ONLY_ENV,
            });
        }
    }
    if (!statusResult.success) {
        return {
            success: false,
            errorCode: SCM_OPERATION_ERROR_CODES.COMMAND_FAILED,
            error: statusResult.stderr || 'Failed to read repository status',
        };
    }

    const statusRaw = statusResult.stdout ?? '';
    const parsedStatus = parseGitStatusPorcelainV2Z(statusRaw);

    // A status command that consumed most of the availability budget is itself
    // the signal that optional diff/worktree/remote enrichment is unsafe for
    // this request. Return the core status snapshot now; a later coalesced
    // refresh can retry enrichment without blocking session lifecycle RPCs.
    if (statusWasDegraded || Date.now() - statusStartedAt >= GIT_STATUS_DEGRADED_THRESHOLD_MS) {
        return {
            success: true,
            snapshot: buildGitSnapshot({
                projectKey: context.projectKey,
                fetchedAt: Date.now(),
                rootPath: context.detection.rootPath,
                currentWorktreePath: context.cwd,
                statusOutput: statusRaw,
                includedNumStatOutput: '',
                pendingNumStatOutput: '',
            }),
        };
    }

    const includedResult = await runScmCommand({
        bin: 'git',
        cwd: context.cwd,
        args: ['diff', '--cached', '--numstat', '-z'],
        timeoutMs: 10_000,
    });
    const pendingResult = await runScmCommand({
        bin: 'git',
        cwd: context.cwd,
        args: ['diff', '--numstat', '-z'],
        timeoutMs: 10_000,
    });
    const worktreesResult = await runScmCommand({
        bin: 'git',
        cwd: repoRoot,
        // FR4-4: `-z` keeps worktree paths whole even when they contain newline
        // characters. Without it, `parseGitWorktreeListPorcelain` would see a
        // truncated path and the security intersection in `getGitWorktreesEnrichment`
        // could admit an unrelated sibling whose absolute path matches the truncation.
        args: ['worktree', 'list', '--porcelain', '-z'],
        timeoutMs: 10_000,
    });
    const remotesResult = await runScmCommand({
        bin: 'git',
        cwd: repoRoot,
        args: ['remote', '-v'],
        timeoutMs: 10_000,
    });
    const remoteHeadRefsResult = await runScmCommand({
        bin: 'git',
        cwd: repoRoot,
        args: ['for-each-ref', '--format=%(refname:short)%09%(symref:short)', 'refs/remotes/*/HEAD'],
        timeoutMs: 10_000,
    });
    const checkoutIdentity = await inspectGitCheckoutIdentity({ cwd: context.cwd });
    const operationState = await readGitBranchOperationState(context);

    const aheadBehind = await readGitAheadBehind({
        cwd: context.cwd,
        hasUpstream: Boolean(parsedStatus.branch.upstream),
    });
    const untrackedStatsByPath = repoRoot && parsedStatus.notAdded.length > 0
        ? await computeUntrackedStatsByPath(repoRoot, parsedStatus.notAdded)
        : {};
    const remotesOutput = remotesResult.success ? (remotesResult.stdout ?? '') : '';
    const hostingProvider = resolveGitHostingProviderFromOutputs({
        statusOutput: statusRaw,
        remotesOutput,
    });
    const pullRequestAuthProfileKey = await resolveHostingAuthProfileKey({
        context,
        provider: hostingProvider,
    });

    const snapshot = buildGitSnapshot({
        projectKey: context.projectKey,
        fetchedAt: Date.now(),
        rootPath: context.detection.rootPath,
        currentWorktreePath: context.cwd,
        mainWorktreePath: resolveMainWorktreePathFromCheckoutIdentity(checkoutIdentity),
        statusOutput: statusResult.stdout ?? '',
        includedNumStatOutput: includedResult.success ? (includedResult.stdout ?? '') : '',
        pendingNumStatOutput: pendingResult.success ? (pendingResult.stdout ?? '') : '',
        branchAhead: aheadBehind?.ahead,
        branchBehind: aheadBehind?.behind,
        untrackedStatsByPath,
        worktreesOutput: worktreesResult.success ? (worktreesResult.stdout ?? '') : '',
        remotesOutput,
        remoteHeadRefsOutput: remoteHeadRefsResult.success ? (remoteHeadRefsResult.stdout ?? '') : '',
        operationState,
        hostingProvider,
        prStatusCache: defaultPrStatusCache,
        pullRequestAuthProfileKey,
    });

    if (request?.includeWorktreeStatus === true && snapshot.repo.worktrees && snapshot.repo.worktrees.length > 0) {
        const enrichedWorktrees = await enrichGitWorktreesWithStatus({
            worktrees: snapshot.repo.worktrees,
            includeWorktreeStatus: true,
        });
        return {
            success: true,
            snapshot: {
                ...snapshot,
                repo: {
                    ...snapshot.repo,
                    worktrees: enrichedWorktrees,
                },
            },
        };
    }

    return {
        success: true,
        snapshot,
    };
}

/**
 * Canonicalize a path for the F7 enrichment-RPC path-validation intersection.
 *
 * Two-stage normalization:
 *   1. Strip a single trailing separator so `/foo` and `/foo/` compare equal.
 *   2. Resolve symlinks via `fs.realpath` when possible. macOS in particular
 *      reports `git worktree list` paths under `/private/var/...` while a
 *      caller might pass the equivalent `/var/...` symlink path, and a strict
 *      string compare would reject those legitimate paths. `realpath` failures
 *      (missing path, EACCES, etc.) fall back to the trim-only form so a
 *      genuinely foreign path is still rejected by intersection.
 */
async function canonicalizeWorktreePathForCompare(path: string): Promise<string> {
    if (typeof path !== 'string' || path.length === 0) return path;
    const trimmed = path === '/' || path === '\\'
        ? path
        : (path.endsWith('/') || path.endsWith('\\') ? path.slice(0, -1) : path);
    try {
        return await realpath(trimmed);
    } catch {
        return trimmed;
    }
}

export async function getGitWorktreesEnrichment(input: {
    context: ScmBackendContext;
    request: Pick<ScmWorktreesEnrichmentRequest, 'worktreePaths'>;
}): Promise<ScmWorktreesEnrichmentResponse> {
    const paths = input.request.worktreePaths ?? [];
    if (paths.length === 0) {
        return { success: true, worktrees: [] };
    }

    // F7: intersect the caller-supplied paths with the actual `git worktree list`
    // for the detected repo. Without this, the enricher would happily probe any
    // filesystem path the daemon user can read (a security boundary leak).
    const repoRoot = input.context.detection.rootPath ?? input.context.cwd;
    const worktreesList = await runScmCommand({
        bin: 'git',
        cwd: repoRoot,
        // FR4-4: `-z` keeps worktree paths whole even when they contain newline
        // characters. Without it, `parseGitWorktreeListPorcelain` would see a
        // truncated path and the security intersection in `getGitWorktreesEnrichment`
        // could admit an unrelated sibling whose absolute path matches the truncation.
        args: ['worktree', 'list', '--porcelain', '-z'],
        timeoutMs: 10_000,
    });
    if (!worktreesList.success) {
        return {
            success: false,
            errorCode: SCM_OPERATION_ERROR_CODES.COMMAND_FAILED,
            error: worktreesList.stderr || 'Failed to list worktrees',
        };
    }
    const knownWorktrees = parseGitWorktreeListPorcelain({
        worktreesOutput: worktreesList.stdout ?? '',
        currentWorktreePath: input.context.cwd,
        mainWorktreePath: repoRoot,
    });

    // FR3-5 (audit 2026-05-12): build a canonical → registered-worktree map so
    // we can probe the CANONICAL path that was actually validated, not the
    // caller-supplied path. The previous code stashed the requested string into
    // `allowedPaths`, which allowed a symlink path to be swapped between
    // validation and the per-worktree git probe (TOCTOU).
    const canonicalToRegisteredPath = new Map<string, string>();
    const knownCanonicalEntries = await Promise.all(
        knownWorktrees.map(async (w) => ({
            registered: w.path,
            canonical: await canonicalizeWorktreePathForCompare(w.path),
        })),
    );
    for (const { registered, canonical } of knownCanonicalEntries) {
        // First-write wins so multiple git-reported paths normalizing to the
        // same canonical (very unusual) still pick a stable registered path.
        if (!canonicalToRegisteredPath.has(canonical)) {
            canonicalToRegisteredPath.set(canonical, registered);
        }
    }

    // FR3-12 (audit 2026-05-12): canonicalize requested paths in parallel
    // (bounded by the schema-enforced max length). The previous serial
    // `for…await` allowed a malformed client to force O(N) filesystem work
    // before the intersection drop ran.
    const requestedCanonicals = await Promise.all(paths.map((p) => canonicalizeWorktreePathForCompare(p)));

    const allowedPaths: string[] = [];
    const seenAllowed = new Set<string>();
    for (const canonical of requestedCanonicals) {
        const registered = canonicalToRegisteredPath.get(canonical);
        if (registered === undefined) continue;
        // Deduplicate so two requested paths resolving to the same worktree
        // produce a single probe + response entry.
        if (seenAllowed.has(registered)) continue;
        seenAllowed.add(registered);
        allowedPaths.push(registered);
    }

    if (allowedPaths.length === 0) {
        return { success: true, worktrees: [] };
    }

    const worktrees = await readWorktreeStatusEnrichmentForPaths({
        worktreePaths: allowedPaths,
    });
    return { success: true, worktrees };
}
