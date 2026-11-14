import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import cliDistBuildManifest from '../../cliDistBuildManifest.cjs';
import { CLI_BINARY_TARGETS, resolveCurrentBinaryTarget, resolveExecutableName } from './targets.js';

const { renameMock, renameDelegate } = vi.hoisted(() => ({
    renameMock: vi.fn(),
    renameDelegate: { current: null as null | typeof import('node:fs/promises').rename },
}));

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    renameDelegate.current = actual.rename;
    return {
        ...actual,
        rename: renameMock,
    };
});

import { buildCliBinaryArtifactPayload } from './buildCliBinaryArtifactPayload.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'build-cli-binary-artifact-payload-win32-'));
    tempDirs.push(dir);
    return dir;
}

async function writeRepoFile(path: string, content: string, timestamp?: Date): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    if (timestamp) {
        await utimes(path, timestamp, timestamp);
    }
}

describe('buildCliBinaryArtifactPayload Windows rename fallback', () => {
    afterEach(async () => {
        renameMock.mockReset();
        await Promise.all(tempDirs.splice(0).map(async (dir) => {
            await rm(dir, { recursive: true, force: true });
        }));
    });

    it('falls back to copying the live dist snapshot when Windows blocks the rename with EPERM', async () => {
        const repoRoot = await createTempDir();
        const payloadDir = join(repoRoot, 'artifacts', 'payload');
        const older = new Date('2026-04-13T18:00:00.000Z');
        const newer = new Date('2026-04-13T18:05:00.000Z');
        const cliDir = join(repoRoot, 'apps', 'cli');
        const cliDistDir = join(cliDir, 'dist');
        const abandonedSnapshotDir = join(cliDir, '.dist.hstack-snapshot-abandoned');

        if (!renameDelegate.current) {
            throw new Error('expected node:fs/promises.rename delegate to be initialized');
        }

        renameMock.mockImplementation(async (from, to) => {
            if (from === cliDistDir && String(to).includes('.dist.hstack-snapshot-')) {
                const error = new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`) as NodeJS.ErrnoException;
                error.code = 'EPERM';
                throw error;
            }
            return renameDelegate.current!(from, to);
        });

        await writeRepoFile(join(repoRoot, 'package.json'), `${JSON.stringify({ name: 'repo-root', private: true })}\n`);
        await writeRepoFile(join(repoRoot, 'yarn.lock'), '');
        await writeRepoFile(join(cliDir, 'package.json'), `${JSON.stringify({
            name: '@happier-dev/cli',
            version: '0.0.0',
            bundledDependencies: [],
            dependencies: {
                '@huggingface/transformers': '0.0.0',
                'node-pty': '0.0.0',
                '@homebridge/node-pty-prebuilt-multiarch': '0.0.0',
            },
        }, null, 2)}\n`, older);
        await writeRepoFile(join(cliDir, 'src', 'index.ts'), 'export default "cli-source";\n', older);
        await writeRepoFile(join(abandonedSnapshotDir, 'index.mjs'), 'export const abandoned = true;\n', older);
        for (const sidecarPath of [
            ['apps', 'cli', 'scripts', 'childProcessOptions.cjs'],
            ['apps', 'cli', 'scripts', 'claude_launcher_runtime.cjs'],
            ['apps', 'cli', 'scripts', 'claude_local_launcher.cjs'],
            ['apps', 'cli', 'scripts', 'claude_remote_launcher.cjs'],
            ['apps', 'cli', 'scripts', 'session_hook_forwarder.cjs'],
            ['apps', 'cli', 'scripts', 'permission_hook_forwarder.cjs'],
            ['apps', 'cli', 'scripts', 'ripgrep_launcher.cjs'],
            ['apps', 'cli', 'scripts', 'statusline_forwarder.cjs'],
            ['apps', 'cli', 'scripts', 'terminal_launch_spec_runner.cjs'],
            ['apps', 'cli', 'scripts', 'node_pty_relay.cjs'],
            ['apps', 'cli', 'scripts', 'runtime', 'placeholder.txt'],
            ['apps', 'cli', 'scripts', 'shims', 'placeholder.txt'],
        ]) {
            await writeRepoFile(join(repoRoot, ...sidecarPath), 'placeholder\n', older);
        }
        await writeRepoFile(join(cliDir, 'tools', 'archives', 'checksums.sha256'), '', older);
        await writeRepoFile(join(cliDir, 'scripts', 'unpack-tools.cjs'), `
const fs = require('fs');
const path = require('path');

function unpackTools(options = {}) {
    const toolsDir = options.toolsDir || path.resolve(__dirname, '..', 'tools');
    const unpackedPath = path.join(toolsDir, 'unpacked');
    fs.mkdirSync(unpackedPath, { recursive: true });
    fs.writeFileSync(path.join(unpackedPath, 'zellij.exe'), 'zellij fixture\\n');
}

module.exports = { unpackTools };
`, older);

        for (const packageName of [
            '@huggingface/transformers',
            'node-pty',
            '@homebridge/node-pty-prebuilt-multiarch',
        ]) {
            await writeRepoFile(
                join(repoRoot, 'node_modules', ...packageName.split('/'), 'package.json'),
                `${JSON.stringify({
                    name: packageName,
                    version: '0.0.0',
                    main: './index.js',
                }, null, 2)}\n`,
                older,
            );
            await writeRepoFile(join(repoRoot, 'node_modules', ...packageName.split('/'), 'index.js'), 'module.exports = {};\n', older);
        }

        await buildCliBinaryArtifactPayload({
            repoRoot,
            payloadDir,
            ensureWorkspacePackagesBuiltByName: async (_root, packageNames) => ({
                ok: true,
                built: [],
                skipped: packageNames,
            }),
            commandProbe: (command) => command === 'bun' || command === 'yarn',
            runCommand: async () => {
                const cliDistEntrypoint = join(cliDistDir, 'index.mjs');
                await writeRepoFile(cliDistEntrypoint, 'export const cli = "fresh";\n', newer);
                cliDistBuildManifest.writeCliDistBuildManifest(cliDistEntrypoint);
            },
            compileBinary: async ({ outfile }) => {
                await writeRepoFile(outfile, 'compiled-binary');
            },
        });

        await expect(readFile(join(payloadDir, 'package-dist', 'index.mjs'), 'utf8')).resolves.toBe('export const cli = "fresh";\n');
        await expect(readFile(join(cliDistDir, 'index.mjs'), 'utf8')).resolves.toBe('export const cli = "fresh";\n');
        const executableName = resolveExecutableName({
            baseName: 'kaiwu',
            target: resolveCurrentBinaryTarget({ availableTargets: CLI_BINARY_TARGETS }),
        });
        expect(existsSync(join(payloadDir, executableName))).toBe(true);
        expect(existsSync(abandonedSnapshotDir)).toBe(false);
    });
});
