import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    resolveCodexAppServerCliInvocation,
    resolveCodexCliInvocation,
} from './resolveCodexCliInvocation';

async function createExecutable(params: Readonly<{ dir: string; name: string }>): Promise<string> {
    mkdirSync(params.dir, { recursive: true });
    const filePath = join(params.dir, params.name);
    writeFileSync(filePath, '#!/bin/sh\necho codex\n', 'utf8');
    chmodSync(filePath, 0o755);
    return filePath;
}

describe('resolveCodexCliInvocation', () => {
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    beforeEach(() => {
        vi.stubEnv('KAIWU_CODEX_APP_SERVER_BIN', undefined);
    });

    afterEach(() => {
        if (originalPlatformDescriptor) {
            Object.defineProperty(process, 'platform', originalPlatformDescriptor);
        }
        vi.unstubAllEnvs();
    });

    it('ignores missing app-server override paths and falls back to the provider CLI resolution', async () => {
        if (process.platform === 'win32') {
            // Windows PATH resolution + exec bits differ; current failure mode is Unix-only.
            return;
        }

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-'));
        const binDir = join(root, 'bin');
        const codexPath = await createExecutable({ dir: binDir, name: 'codex' });

        const originalPath = process.env.PATH ?? '';
        vi.stubEnv('PATH', `${binDir}:${originalPath}`);
        vi.stubEnv('HAPPIER_CODEX_APP_SERVER_BIN', join(root, 'missing-codex-app-server'));

        const invocation = await resolveCodexCliInvocation({
            args: ['app-server', '--listen', 'stdio://'],
            processEnv: process.env,
            overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
            targetLabel: 'Codex app-server',
        });

        expect(invocation.command).toBe(codexPath);
    });

    it('expands ~ in override env vars before resolving the Codex CLI invocation', async () => {
        if (process.platform === 'win32') {
            // Windows home dir resolution differs; `~` expansion is primarily a Unix affordance.
            return;
        }

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-home-'));
        try {
            const homeTmp = join(root, 'fixture');
            const binDir = join(homeTmp, 'bin');
            const codexPath = await createExecutable({ dir: binDir, name: 'codex-app-server' });

            vi.stubEnv('HOME', root);
            const override = '~/fixture/bin/codex-app-server';
            vi.stubEnv('HAPPIER_CODEX_APP_SERVER_BIN', override);

            const invocation = await resolveCodexCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                processEnv: process.env,
                overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command).toBe(codexPath);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('expands ~ in override env vars against the provided processEnv HOME', async () => {
        if (process.platform === 'win32') {
            return;
        }

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-scoped-home-'));
        const scopedHome = join(root, 'home');
        try {
            const binDir = join(scopedHome, 'bin');
            const codexPath = await createExecutable({ dir: binDir, name: 'codex-app-server' });

            const invocation = await resolveCodexCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                processEnv: {
                    ...process.env,
                    HOME: scopedHome,
                    HAPPIER_CODEX_APP_SERVER_BIN: '~/bin/codex-app-server',
                },
                overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command).toBe(codexPath);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('ignores override paths that point at a directory and falls back to provider CLI resolution', async () => {
        if (process.platform === 'win32') {
            // Windows PATH resolution + exec bits differ; current failure mode is Unix-only.
            return;
        }

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-'));
        try {
            const homeTmp = join(root, 'home-fixture');
            const homeBinDir = join(homeTmp, 'bin');
            mkdirSync(homeBinDir, { recursive: true });
            vi.stubEnv('HOME', root);
            vi.stubEnv('HAPPIER_CODEX_APP_SERVER_BIN', '~/home-fixture/bin');

            const binDir = join(root, 'bin');
            const codexPath = await createExecutable({ dir: binDir, name: 'codex' });
            const originalPath = process.env.PATH ?? '';
            vi.stubEnv('PATH', `${binDir}:${originalPath}`);

            const invocation = await resolveCodexCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                processEnv: process.env,
                overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command).toBe(codexPath);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('resolves relative override paths against the provided cwd', async () => {
        if (process.platform === 'win32') {
            return;
        }

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-cwd-'));
        try {
            const cwd = join(root, 'project');
            const binDir = join(cwd, 'bin');
            const codexPath = await createExecutable({ dir: binDir, name: 'codex-app-server' });
            vi.stubEnv('HAPPIER_CODEX_APP_SERVER_BIN', './bin/codex-app-server');

            const invocation = await resolveCodexCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                cwd,
                processEnv: process.env,
                overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command).toBe(codexPath);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('prefers the .cmd shim over an extensionless Windows override path', async () => {
        if (!originalPlatformDescriptor) {
            throw new Error('Expected process.platform to be configurable for this test');
        }
        Object.defineProperty(process, 'platform', { ...originalPlatformDescriptor, value: 'win32' });

        const root = await mkdtemp(join(tmpdir(), 'happier-codex-cli-invocation-win32-'));
        try {
            const cwd = join(root, 'project');
            const binDir = join(cwd, 'bin');
            mkdirSync(binDir, { recursive: true });

            const extensionlessPath = join(binDir, 'codex-app-server');
            writeFileSync(extensionlessPath, '', 'utf8');
            const cmdShimPath = join(binDir, 'codex-app-server.cmd');
            writeFileSync(cmdShimPath, '@echo off\r\necho codex\r\n', 'utf8');

            vi.stubEnv('HAPPIER_CODEX_APP_SERVER_BIN', './bin/codex-app-server');
            vi.stubEnv('PATHEXT', '.CMD;.EXE');

            const invocation = await resolveCodexCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                cwd,
                processEnv: process.env,
                overrideEnvVarKeys: ['HAPPIER_CODEX_APP_SERVER_BIN'],
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command.toLowerCase()).toBe(cmdShimPath.toLowerCase());
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('does not use TUI overrides when resolving an app-server invocation', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happier-codex-app-server-invocation-'));
        try {
            const extension = process.platform === 'win32' ? '.cmd' : '';
            const tuiShimPath = join(root, `codex-tui${extension}`);
            const nativeCodexPath = join(root, `codex-native${extension}`);
            const shimContents = process.platform === 'win32'
                ? '@echo off\r\nexit /b 2\r\n'
                : '#!/bin/sh\nexit 2\n';
            const nativeContents = process.platform === 'win32'
                ? '@echo off\r\nexit /b 0\r\n'
                : '#!/bin/sh\nexit 0\n';
            writeFileSync(tuiShimPath, shimContents, 'utf8');
            writeFileSync(nativeCodexPath, nativeContents, 'utf8');
            if (process.platform !== 'win32') {
                chmodSync(tuiShimPath, 0o755);
                chmodSync(nativeCodexPath, 0o755);
            }

            const invocation = await resolveCodexAppServerCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                processEnv: {
                    ...process.env,
                    KAIWU_CODEX_APP_SERVER_BIN: undefined,
                    HAPPIER_CODEX_APP_SERVER_BIN: undefined,
                    HAPPIER_CODEX_TUI_BIN: tuiShimPath,
                    HAPPY_CODEX_TUI_BIN: undefined,
                    HAPPIER_CODEX_PATH: nativeCodexPath,
                },
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command.toLowerCase()).toBe(nativeCodexPath.toLowerCase());
            expect(invocation.args).toEqual(['app-server', '--listen', 'stdio://']);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('prefers the Kaiwu app-server override and keeps the Happier name as a fallback', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happier-kaiwu-codex-app-server-override-'));
        try {
            const extension = process.platform === 'win32' ? '.cmd' : '';
            const kaiwuBridge = join(root, `kaiwu-app-server${extension}`);
            const happierBridge = join(root, `happier-app-server${extension}`);
            const script = process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n';
            writeFileSync(kaiwuBridge, script, 'utf8');
            writeFileSync(happierBridge, script, 'utf8');
            if (process.platform !== 'win32') {
                chmodSync(kaiwuBridge, 0o755);
                chmodSync(happierBridge, 0o755);
            }

            const invocation = await resolveCodexAppServerCliInvocation({
                args: ['app-server', '--listen', 'stdio://'],
                processEnv: {
                    ...process.env,
                    KAIWU_CODEX_APP_SERVER_BIN: kaiwuBridge,
                    HAPPIER_CODEX_APP_SERVER_BIN: happierBridge,
                },
                targetLabel: 'Codex app-server',
            });

            expect(invocation.command.toLowerCase()).toBe(kaiwuBridge.toLowerCase());
            expect(invocation.args).toEqual(['app-server', '--listen', 'stdio://']);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
