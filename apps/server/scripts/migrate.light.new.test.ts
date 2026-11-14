import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { spawnMock, fileSyncMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
    fileSyncMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => {
        spawnMock(...args);
        return {
            on(event: string, handler: (code: number) => void) {
                if (event === 'exit') {
                    queueMicrotask(() => handler(0));
                }
                return this;
            },
        };
    },
}));

vi.mock('tmp', () => ({
    default: {
        fileSync: (...args: unknown[]) => fileSyncMock(...args),
    },
}));

describe('migrate.light.new.ts', () => {
    let tmpDir = '';
    let originalArgv: string[] = [];

    async function waitForSpawnCount(expected: number): Promise<void> {
        for (let i = 0; i < 40; i++) {
            if (spawnMock.mock.calls.length >= expected) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        throw new Error(`Timed out waiting for ${expected} spawn calls; saw ${spawnMock.mock.calls.length}`);
    }

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'happier-server-light-new-migrate-'));
        spawnMock.mockClear();
        fileSyncMock.mockReset().mockReturnValue({
            name: join(tmpDir, 'happy server #light.sqlite'),
        });
        originalArgv = process.argv.slice();
        process.argv = [...originalArgv, '--name', 'add_test'];
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
        process.argv = originalArgv;
        vi.resetModules();
    });

    it('derives a safe sqlite DATABASE_URL for the temporary migration database', async () => {
        await import('./migrate.light.new');
        await waitForSpawnCount(2);

        const prismaCall = spawnMock.mock.calls.find(([, args]) => {
            // On Windows yarn.cmd is wrapped as `cmd.exe /d /s /c "<escaped command line>"`, so match tokens
            // inside the joined command line rather than as discrete argv entries.
            const commandLine = (Array.isArray(args) ? args : []).map(String).join(' ');
            const tokens = new Set(commandLine.split(/[^A-Za-z0-9_-]+/));
            return tokens.has('prisma') && tokens.has('migrate') && tokens.has('dev');
        });

        expect(prismaCall).toBeDefined();
        const env = (prismaCall?.[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env;
        const tmpDbUrl = pathToFileURL(join(tmpDir, 'happy server #light.sqlite'));
        // Prisma-compatible drive-letter form on Windows (file:C:/...), standard file:/// elsewhere.
        const tmpDbFileUrl = process.platform === 'win32'
            ? `file:${tmpDbUrl.pathname.replace(/^\//, '')}`
            : tmpDbUrl.href;
        const expected = `${tmpDbFileUrl}?socket_timeout=30`;
        expect(env?.DATABASE_URL).toBe(expected);
    });
});
