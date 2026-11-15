/**
 * Contract for the git backend's worktree-enrichment fingerprint throttle:
 * a full per-worktree scan is skipped while the worktree list and every
 * worktree's dirty state are unchanged, and it runs again as soon as that
 * fingerprint moves.
 *
 * The throttle is module-level state, so each test re-imports the repository
 * module after resetting modules. `runScmCommand` is the only injected boundary
 * (no real git repository is created); the throttle's fingerprint timestamp is
 * driven by the `_MIN_INTERVAL_MS` env override.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const runScmCommandMock = vi.hoisted(() => vi.fn());
const realpathMock = vi.hoisted(() => vi.fn());

vi.mock('../../runtime', () => ({
    runScmCommand: (...args: unknown[]) => runScmCommandMock(...args),
    normalizeRepoRootRelativePath: (raw: string) => ({ ok: true, relativePath: raw }),
}));

// The SCM hosting-provider detection helpers are outside this contract. Their
// transitive import graph reaches the provider catalog, which is not needed to
// observe the enrichment throttle; cut it at the two CLI-probe boundaries.
vi.mock('@/capabilities/cliAuth/shared', () => ({
    runCliCommandBestEffort: vi.fn(async () => ({ ok: false })),
}));

vi.mock('@/capabilities/deps/gh', () => ({
    resolveGithubCliCommandPath: vi.fn(async () => null),
}));

vi.mock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    return {
        ...actual,
        realpath: (...args: unknown[]) => realpathMock(...args),
    };
});

const WORKTREE_LIST_OUTPUT = [
    'worktree',
    '/canon/repo',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    '',
].join('\0');

const PROBE_ARGS = 'status --porcelain=v2 -z --branch --untracked-files=normal --no-ahead-behind';
const ENRICHMENT_PORCELAIN_ARGS = 'status --porcelain -z';
const HEAD_TIME_ARGS = 'log -1 --format=%ct';

function ok(stdout: string) {
    return { success: true, exitCode: 0, stdout, stderr: '', timedOut: false };
}

describe('getGitWorktreesEnrichment fingerprint throttle', () => {
    let probeOutput = '1 .M N... 100644 100644 100644 aaa bbb file.txt\0';
    let enrichmentPorcelainOutput = ' M file.txt\0';
    let probeCalls = 0;
    let enrichmentScanCalls = 0;

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        runScmCommandMock.mockReset();
        realpathMock.mockReset();
        probeCalls = 0;
        enrichmentScanCalls = 0;
    });

    const importRepository = async (minIntervalMs = '0') => {
        vi.stubEnv('HAPPIER_SCM_WORKTREES_ENRICHMENT_MIN_INTERVAL_MS', minIntervalMs);
        runScmCommandMock.mockImplementation(async (input: { args: readonly string[] }) => {
            const command = (input.args ?? []).join(' ');
            if (command === 'worktree list --porcelain -z') return ok(WORKTREE_LIST_OUTPUT);
            if (command === PROBE_ARGS) {
                probeCalls += 1;
                return ok(probeOutput);
            }
            if (command === ENRICHMENT_PORCELAIN_ARGS) {
                enrichmentScanCalls += 1;
                return ok(enrichmentPorcelainOutput);
            }
            if (command === HEAD_TIME_ARGS) return ok('1700000000\n');
            throw new Error(`Unexpected git command: ${command}`);
        });
        realpathMock.mockImplementation(async (path: string) => path);
        return await import('./repository');
    };

    const requestEnrichment = async (
        getGitWorktreesEnrichment: typeof import('./repository').getGitWorktreesEnrichment,
    ) => await getGitWorktreesEnrichment({
        context: {
            cwd: '/canon/repo',
            projectKey: 'throttle-contract',
            detection: { isRepo: true, rootPath: '/canon/repo', mode: '.git' },
        },
        request: { worktreePaths: ['/canon/repo'] },
    });

    it('skips the per-worktree scan while the fingerprint is unchanged and reruns it after a change', async () => {
        const { getGitWorktreesEnrichment } = await importRepository();

        const first = await requestEnrichment(getGitWorktreesEnrichment);
        expect(first).toEqual({
            success: true,
            worktrees: [{ path: '/canon/repo', changeCount: 1, lastActivityAt: 1_700_000_000_000 }],
        });
        expect(enrichmentScanCalls).toBe(1);

        // Same worktree list and dirty state: the fingerprint is unchanged, so
        // the scan is skipped even though the minimum interval allows a probe.
        const second = await requestEnrichment(getGitWorktreesEnrichment);
        expect(second).toEqual(first);
        expect(probeCalls).toBe(2);
        expect(enrichmentScanCalls).toBe(1);

        // A new dirty file changes the fingerprint, so the scan must run again.
        probeOutput = '1 .M N... 100644 100644 100644 aaa bbb file.txt\0? new.txt\0';
        enrichmentPorcelainOutput = ' M file.txt\0?? new.txt\0';
        const third = await requestEnrichment(getGitWorktreesEnrichment);
        expect(third).toEqual({
            success: true,
            worktrees: [{ path: '/canon/repo', changeCount: 2, lastActivityAt: 1_700_000_000_000 }],
        });
        expect(enrichmentScanCalls).toBe(2);
    });

    it('does not probe the fingerprint again inside the minimum interval', async () => {
        const { getGitWorktreesEnrichment } = await importRepository('600000');

        await requestEnrichment(getGitWorktreesEnrichment);
        await requestEnrichment(getGitWorktreesEnrichment);
        expect(probeCalls).toBe(1);
        expect(enrichmentScanCalls).toBe(1);
    });
});