import { existsSync } from 'node:fs';
import { lstat, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    promoteVersionedPayload,
    resolveInstalledFirstPartyComponentPaths,
} from './index.js';

async function createPayload(rootDir: string, versionId: string, contents: string): Promise<string> {
    const payloadRoot = join(rootDir, `payload-${versionId}`);
    await mkdir(join(payloadRoot, 'package-dist'), { recursive: true });
    await writeFile(join(payloadRoot, 'kaiwu'), contents, 'utf8');
    await writeFile(join(payloadRoot, 'kaiwu.exe'), contents, 'utf8');
    await writeFile(join(payloadRoot, 'happier'), contents, 'utf8');
    await writeFile(join(payloadRoot, 'happier.exe'), contents, 'utf8');
    await writeFile(join(payloadRoot, 'package-dist', 'index.mjs'), `export default ${JSON.stringify(versionId)};\n`, 'utf8');
    return payloadRoot;
}

describe('promoteVersionedPayload', () => {
    it('ignores AppleDouble metadata files in the staged payload', async () => {
        const homeDir = await mkdtemp(join(tmpdir(), 'happier-promote-versioned-payload-appledouble-'));
        const env = { ...process.env, HAPPIER_HOME_DIR: homeDir, KAIWU_HOME_DIR: homeDir };

        try {
            const stagedPayloadPath = await createPayload(homeDir, '1.0.0', 'first-version');
            await writeFile(join(stagedPayloadPath, '._happier'), 'appledouble', 'utf8');
            await mkdir(join(stagedPayloadPath, 'package-dist', 'nested'), { recursive: true });
            await writeFile(join(stagedPayloadPath, 'package-dist', 'nested', '._index.mjs'), 'appledouble', 'utf8');

            const promotion = await promoteVersionedPayload({
                componentId: 'happier-cli',
                processEnv: env,
                versionId: '1.0.0',
                stagedPayloadPath,
            });

            expect(promotion.currentVersionId).toBe('1.0.0');

            const paths = resolveInstalledFirstPartyComponentPaths({
                componentId: 'happier-cli',
                processEnv: env,
            });
            expect(existsSync(join(paths.currentPath, '._happier'))).toBe(false);
            expect(existsSync(join(paths.currentPath, 'package-dist', 'nested', '._index.mjs'))).toBe(false);
            expect(await readFile(paths.binaryPath, 'utf8')).toBe('first-version');
        } finally {
            await rm(homeDir, { recursive: true, force: true });
        }
    });

    it('moves the staged payload into the versioned install tree on posix platforms', async () => {
        const homeDir = await mkdtemp(join(tmpdir(), 'happier-promote-versioned-payload-move-'));
        const env = { ...process.env, HAPPIER_HOME_DIR: homeDir, KAIWU_HOME_DIR: homeDir };

        try {
            const stagedPayloadPath = await createPayload(homeDir, '1.0.1', 'moved-version');

            const promotion = await promoteVersionedPayload({
                componentId: 'happier-cli',
                processEnv: env,
                versionId: '1.0.1',
                stagedPayloadPath,
            });

            expect(promotion.versionPath).not.toBe(stagedPayloadPath);
            await expect(stat(stagedPayloadPath)).rejects.toMatchObject({ code: 'ENOENT' });

            const paths = resolveInstalledFirstPartyComponentPaths({
                componentId: 'happier-cli',
                processEnv: env,
            });
            expect(await readFile(paths.binaryPath, 'utf8')).toBe('moved-version');
            expect((await lstat(paths.currentPath)).isSymbolicLink()).toBe(true);
        } finally {
            await rm(homeDir, { recursive: true, force: true });
        }
    });

    it('does not generate cli-preview in sentinel directory when running with temporary processEnv', async () => {
        const sentinelDir = await mkdtemp(join(tmpdir(), 'happier-sentinel-home-'));
        const tempHome = await mkdtemp(join(tmpdir(), 'happier-temp-home-'));
        const originalKaiwu = process.env.KAIWU_HOME_DIR;
        const originalHappier = process.env.HAPPIER_HOME_DIR;

        try {
            process.env.KAIWU_HOME_DIR = sentinelDir;
            process.env.HAPPIER_HOME_DIR = sentinelDir;

            const tempEnv = { ...process.env, HAPPIER_HOME_DIR: tempHome, KAIWU_HOME_DIR: tempHome };
            const stagedPayloadPath = await createPayload(tempHome, '1.0.0-preview.1', 'preview-payload');

            const promotion = await promoteVersionedPayload({
                componentId: 'happier-cli',
                channel: 'preview',
                processEnv: tempEnv,
                versionId: '1.0.0-preview.1',
                stagedPayloadPath,
            });

            expect(promotion.currentVersionId).toBe('1.0.0-preview.1');
            expect(existsSync(join(sentinelDir, 'cli-preview'))).toBe(false);
            expect(existsSync(join(tempHome, 'cli-preview'))).toBe(true);
        } finally {
            if (originalKaiwu !== undefined) process.env.KAIWU_HOME_DIR = originalKaiwu;
            else delete process.env.KAIWU_HOME_DIR;
            if (originalHappier !== undefined) process.env.HAPPIER_HOME_DIR = originalHappier;
            else delete process.env.HAPPIER_HOME_DIR;
            await rm(sentinelDir, { recursive: true, force: true });
            await rm(tempHome, { recursive: true, force: true });
        }
    });
});
