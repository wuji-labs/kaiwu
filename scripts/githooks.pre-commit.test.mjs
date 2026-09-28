// Contract tests for .githooks/pre-commit (the commit gate every session hits).
// Run: node --test scripts/githooks.pre-commit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, utimesSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookSource = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-commit');

function makeRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'kaiwu-hook-'));
    const git = (args, env = {}) => spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    git(['config', 'core.hooksPath', '.githooks']);
    writeFileSync(join(dir, 'mine.txt'), 'one\n');
    writeFileSync(join(dir, 'theirs.txt'), 'one\n');
    git(['add', 'mine.txt', 'theirs.txt']);
    // Seed commit before the hook exists.
    assert.equal(git(['commit', '-qm', 'init']).status, 0);
    spawnSync('mkdir', ['-p', join(dir, '.githooks')]);
    copyFileSync(hookSource, join(dir, '.githooks', 'pre-commit'));
    return { dir, git, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function ageFile(path, hours) {
    const t = new Date(Date.now() - hours * 3600 * 1000);
    utimesSync(path, t, t);
}

test('allows a pathspec commit of freshly edited files', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'mine.txt'), 'two\n');
    const r = git(['commit', '-qm', 'mine', '--', 'mine.txt']);
    assert.equal(r.status, 0, r.stderr);
    cleanup();
});

test('refuses git add + git commit through the shared index', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'mine.txt'), 'two\n');
    git(['add', 'mine.txt']);
    const r = git(['commit', '-qm', 'staged']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /shared staging index/);
    cleanup();
});

test('refuses git commit -a', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'mine.txt'), 'two\n');
    const r = git(['commit', '-qam', 'all']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /shared staging index/);
    cleanup();
});

test('refuses sweeping in another session\'s stale change even with a pathspec', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'theirs.txt'), 'abandoned edit\n');
    ageFile(join(dir, 'theirs.txt'), 96);
    writeFileSync(join(dir, 'mine.txt'), 'two\n');
    const r = git(['commit', '-qm', 'sweep', '--', '.']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /theirs\.txt/);
    assert.doesNotMatch(r.stderr, /mine\.txt/);
    cleanup();
});

test('adopting stale work is allowed only explicitly, and is audited', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'theirs.txt'), 'abandoned edit\n');
    ageFile(join(dir, 'theirs.txt'), 96);
    const r = git(['commit', '-qm', 'adopt', '--', 'theirs.txt'], { KAIWU_ADOPT_STALE_WIP: '1' });
    assert.equal(r.status, 0, r.stderr);
    const audit = join(dir, '.git', 'kaiwu-commit-audit.log');
    assert.ok(existsSync(audit));
    assert.match(readFileSync(audit, 'utf8'), /KAIWU_ADOPT_STALE_WIP\ttheirs\.txt/);
    cleanup();
});

test('a deliberate full-index commit is allowed only explicitly, and is audited', () => {
    const { dir, git, cleanup } = makeRepo();
    writeFileSync(join(dir, 'mine.txt'), 'two\n');
    git(['add', 'mine.txt']);
    const r = git(['commit', '-qm', 'index'], { KAIWU_ALLOW_INDEX_COMMIT: '1' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(dir, '.git', 'kaiwu-commit-audit.log'), 'utf8'), /KAIWU_ALLOW_INDEX_COMMIT/);
    cleanup();
});
