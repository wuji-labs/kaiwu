import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScmBackendContext } from '../../types';

const runScmCommandMock = vi.hoisted(() => vi.fn());

vi.mock('../../runtime', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../runtime')>();
    return {
        ...actual,
        runScmCommand: (...args: unknown[]) => runScmCommandMock(...args),
    };
});

vi.mock('./checkoutIdentity', () => ({
    inspectGitCheckoutIdentity: vi.fn(async () => null),
}));

vi.mock('./operations/branchOperationState', () => ({
    readGitBranchOperationState: vi.fn(async () => null),
}));

import { getGitSnapshot } from './repository';

function buildContext(): ScmBackendContext {
    return {
        cwd: 'C:\\workspace',
        projectKey: 'machine-1:C:\\workspace',
        detection: {
            isRepo: true,
            rootPath: 'C:\\workspace',
            mode: '.git',
        },
    };
}

function success(stdout = '') {
    return { success: true, stdout, stderr: '', exitCode: 0 };
}

function statusOutput(extra = ''): string {
    return [
        '# branch.oid 1111111111111111111111111111111111111111',
        '# branch.head main',
        '# branch.upstream origin/main',
        extra,
    ].filter(Boolean).join('\0') + '\0';
}

describe('getGitSnapshot Git status performance policy', () => {
    afterEach(() => {
        runScmCommandMock.mockReset();
        vi.restoreAllMocks();
    });

    it('uses bounded untracked status, disables optional index locks, and restores ahead/behind counts', async () => {
        runScmCommandMock.mockImplementation(async (input: { args: string[] }) => {
            if (input.args[0] === 'status') return success(statusOutput());
            if (input.args[0] === 'rev-list') return success('2\t3\n');
            return success();
        });

        const response = await getGitSnapshot({ context: buildContext() });

        expect(response.success).toBe(true);
        expect(response.snapshot?.branch).toMatchObject({ ahead: 2, behind: 3, upstream: 'origin/main' });

        const statusCall = runScmCommandMock.mock.calls
            .map(([value]) => value as { args: string[]; env?: Record<string, string | undefined> })
            .find((value) => value.args[0] === 'status');
        expect(statusCall).toMatchObject({
            args: expect.arrayContaining(['--untracked-files=normal', '--no-ahead-behind']),
            env: expect.objectContaining({ GIT_OPTIONAL_LOCKS: '0' }),
        });
        expect(statusCall?.args).not.toContain('--untracked-files=all');

        expect(runScmCommandMock).toHaveBeenCalledWith(expect.objectContaining({
            args: ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
            timeoutMs: 2_000,
            env: expect.objectContaining({ GIT_OPTIONAL_LOCKS: '0' }),
        }));
    });

    it('falls back to tracked status when bounded untracked enumeration times out', async () => {
        runScmCommandMock.mockImplementation(async (input: { args: string[] }) => {
            if (input.args[0] === 'status' && input.args.includes('--untracked-files=normal')) {
                return {
                    success: false,
                    stdout: '',
                    stderr: 'timed out',
                    exitCode: -1,
                    timedOut: true,
                };
            }
            if (input.args[0] === 'status') return success(statusOutput());
            return success();
        });

        const response = await getGitSnapshot({ context: buildContext() });

        expect(response.success).toBe(true);
        const statusCalls = runScmCommandMock.mock.calls
            .map(([value]) => value as { args: string[] })
            .filter((value) => value.args[0] === 'status');
        expect(statusCalls).toHaveLength(2);
        expect(statusCalls[1]?.args).toContain('--untracked-files=no');
        expect(runScmCommandMock.mock.calls.some(([value]) => {
            const args = (value as { args: string[] }).args;
            return args[0] === 'diff' || args[0] === 'worktree' || args[0] === 'remote';
        })).toBe(false);
    });

    it('does not rescan the repository with a second untracked-files command', async () => {
        runScmCommandMock.mockImplementation(async (input: { args: string[] }) => {
            if (input.args[0] === 'status') return success(statusOutput('? untracked.txt'));
            return success();
        });

        const response = await getGitSnapshot({ context: buildContext() });

        expect(response.success).toBe(true);
        expect(response.snapshot?.entries.map((entry) => entry.path)).toContain('untracked.txt');
        expect(runScmCommandMock.mock.calls.some(([value]) => {
            const args = (value as { args: string[] }).args;
            return args[0] === 'ls-files' && args.includes('--others');
        })).toBe(false);
    });

    it('returns the core snapshot without optional enrichment when status itself is slow', async () => {
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1_000)
            .mockReturnValueOnce(3_000)
            .mockReturnValue(3_000);
        runScmCommandMock.mockImplementation(async (input: { args: string[] }) => {
            if (input.args[0] === 'status') return success(statusOutput('? untracked.txt'));
            throw new Error(`optional enrichment should not run: ${input.args.join(' ')}`);
        });

        const response = await getGitSnapshot({ context: buildContext() });

        expect(response.success).toBe(true);
        expect(response.snapshot?.entries.map((entry) => entry.path)).toContain('untracked.txt');
        expect(runScmCommandMock).toHaveBeenCalledTimes(1);
    });
});
