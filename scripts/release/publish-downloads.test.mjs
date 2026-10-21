import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/^\/(\w):/, '$1:');
const scriptPath = join(repoRoot, 'scripts', 'release', 'publish-downloads.mjs');

const expectedNames = {
    'desktop-windows': 'kaiwu-desktop-v1.2.3-windows-x64.zip',
    'desktop-macos': 'kaiwu-desktop-v1.2.3-macos-apple-silicon.dmg',
    'desktop-linux': 'kaiwu-desktop-v1.2.3-linux-x64.AppImage',
    harmony: 'kaiwu-v1.2.3-harmony.hap',
};

test('publish-downloads accepts desktop and harmony platform keys in dry-run mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'kaiwu-publish-downloads-'));
    const artifactPath = join(tempDir, 'artifact.bin');
    writeFileSync(artifactPath, 'test artifact');

    try {
        for (const [platform, filename] of Object.entries(expectedNames)) {
            const output = execFileSync(
                process.execPath,
                [scriptPath, '--platform', platform, '--version', '1.2.3', '--file', artifactPath, '--dry-run'],
                { cwd: repoRoot, encoding: 'utf8' },
            );
            assert.match(output, new RegExp(`规范名称: ${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        }
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
});

test('download page hides unpublished desktop rows until manifest data exists', () => {
    const html = readFileSync(join(repoRoot, 'apps', 'website', 'public', 'download', 'index.html'), 'utf8');

    assert.match(html, /<section id="desktop" hidden>/);
    assert.match(html, /if\s*\(!d\s*\|\|\s*!d\.version\)[\s\S]*?row\.style\.display\s*=\s*['"]none['"]/);
    assert.match(html, /desktopVisible[\s\S]*?getElementById\(['"]desktop['"]\)[\s\S]*?hidden\s*=\s*!desktopVisible/);
});
