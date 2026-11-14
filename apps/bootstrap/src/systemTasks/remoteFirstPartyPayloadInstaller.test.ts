import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { installRemoteFirstPartyComponent } from './remoteFirstPartyPayloadInstaller.js';

function createPayloadRootFixture(): Readonly<{
    payloadRoot: string;
    cleanup: () => void;
}> {
    const rootDir = mkdtempSync(join(tmpdir(), 'hsetup-remote-first-party-fixture-'));
    const payloadRoot = join(rootDir, 'payload-root');
    mkdirSync(payloadRoot, { recursive: true });
    writeFileSync(join(payloadRoot, 'happier'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    return {
        payloadRoot,
        cleanup: () => {
            rmSync(rootDir, { recursive: true, force: true });
        },
    };
}

describe('installRemoteFirstPartyComponent', () => {
    it('uploads a verified payload and installs it with staged payload extraction instead of curl bash', async () => {
        const remoteCommands: string[] = [];
        const copiedPaths: Array<Readonly<{ localPath: string; remotePath: string }>> = [];
        const fixture = createPayloadRootFixture();

        try {
            const result = await installRemoteFirstPartyComponent({
                componentId: 'happier-cli',
                channel: 'preview',
                ssh: {
                    target: 'dev@example.test',
                    auth: 'agent',
                },
                knownHostsMode: 'system',
            }, {
                now: () => 1700000000000,
                resolveRemoteReleaseTarget: async () => ({
                    os: 'linux',
                    arch: 'x64',
                }),
                preparePayload: async () => ({
                    componentId: 'happier-cli',
                    channel: 'preview',
                    versionId: '1.2.3',
                    payloadRoot: fixture.payloadRoot,
                    source: 'https://example.test/happier.tgz',
                    cleanup: async () => undefined,
                }),
                copyLocalDirectoryToRemote: async ({ localPath, remotePath }) => {
                    copiedPaths.push({ localPath, remotePath });
                },
                runRemoteText: async ({ remoteCommand }) => {
                    remoteCommands.push(remoteCommand);
                    return {
                        status: 0,
                        stdout: '',
                        stderr: '',
                    };
                },
            });

            expect(copiedPaths).toEqual([
                {
                    // localPath is a host path (host separator).
                    localPath: expect.stringContaining(`${sep}happier-first-party-scp-`),
                    remotePath: '.happier/bootstrap-staging/happier-cli-1.2.3-1700000000000',
                },
            ]);
            expect(remoteCommands.join('\n')).not.toContain('curl -fsSL https://happier.dev/install');
            expect(remoteCommands.join('\n')).toContain('tar -xf');
            expect(remoteCommands.join('\n')).toContain('ln -sfn');
            expect(result).toEqual({
                binaryPath: '$HOME/.happier/cli-preview/current/kaiwu',
                versionId: '1.2.3',
                source: 'https://example.test/happier.tgz',
            });
        } finally {
            fixture.cleanup();
        }
    });
});
