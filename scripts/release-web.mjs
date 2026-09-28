#!/usr/bin/env node
// One-command web release for kaiwu.chengqiyun.com. Every step is fail-closed; the live
// index.html is only swapped after the gate, the build and the COS verification all pass.
//
//   1. preconditions: commit gate installed (core.hooksPath=.githooks); apps/ui and packages
//      have no uncommitted changes, so the build is exactly HEAD (no other session's WIP ships)
//   2. release gate: scripts/release-critical-tests.mjs (critical tests + typecheck ratchet)
//   3. build: expo export --platform web into apps/ui/dist-release
//   4. COS: scripts/sync-ui-to-cos.py upload, then --verify-only must pass for every file
//      (hashed bundles must exist on COS before index.html points at them: 2026-09-07 blank screen)
//   5. server: back up /opt/wuji-kaiwu/ui-dist, overwrite in place, swap index.html last
//      (in place, keeping the container bind mount; no container restart)
//   6. live verification: served index -> built main bundle, 302 -> COS 200,
//      headless Chromium loads the page without uncaught errors
//
// Usage: node scripts/release-web.mjs [--no-deploy]
//   --no-deploy  stop after the COS verification (nothing live changes)
// Env: KAIWU_DEPLOY_SSH_KEY (default ~/.ssh/chengqiyun_lighthouse_id_ed25519)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = join(repoRoot, 'apps', 'ui');
const outDir = join(uiRoot, 'dist-release');
const SITE = 'https://kaiwu.chengqiyun.com';
const SERVER = 'ubuntu@150.158.55.6';
const REMOTE_DIST = '/opt/wuji-kaiwu/ui-dist';
const isWindows = process.platform === 'win32';
const sshBin = isWindows ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh';
const scpBin = isWindows ? 'C:\\Windows\\System32\\OpenSSH\\scp.exe' : 'scp';
// Git Bash's GNU tar reads "D:\..." as a remote host; the system bsdtar handles drive letters.
const tarBin = isWindows ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
const sshKey = process.env.KAIWU_DEPLOY_SSH_KEY || join(homedir(), '.ssh', 'chengqiyun_lighthouse_id_ed25519');
const sshOpts = ['-i', sshKey, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=20'];
const args = new Set(process.argv.slice(2));

function fail(message) {
    console.error(`\n[release-web] FAIL: ${message}`);
    process.exit(1);
}

function step(message) {
    console.log(`\n[release-web] ${message}`);
}

function sh(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
    if (result.error) fail(`${command}: ${result.error.message}`);
    return result;
}

function git(commandArgs) {
    const result = sh('git', commandArgs, { cwd: repoRoot });
    if (result.status !== 0) fail(`git ${commandArgs.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
}

function mainBundleOf(html) {
    return /index-[0-9a-f]{32}\.js/.exec(html)?.[0] ?? null;
}

// 1. preconditions
step('1/6 preconditions');
if (git(['config', '--get', 'core.hooksPath']) !== '.githooks') {
    fail('commit gate not installed: run `git config core.hooksPath .githooks` in the repo root');
}
const dirty = git(['status', '--porcelain', '--', 'apps/ui', 'packages'])
    .split('\n')
    .filter((line) => line && !line.includes('apps/ui/dist-release'));
if (dirty.length > 0) {
    fail(`uncommitted changes would ship without review; commit or remove them first:\n  ${dirty.join('\n  ')}`);
}
const headSha = git(['rev-parse', 'HEAD']);
console.log(`  building ${headSha}`);

// 2. release gate
step('2/6 release gate');
const gate = sh(process.execPath, [join(repoRoot, 'scripts', 'release-critical-tests.mjs')], { cwd: repoRoot, stdio: 'inherit' });
if (gate.status !== 0) fail('release gate did not pass');

// 3. build
step('3/6 build web export');
rmSync(outDir, { recursive: true, force: true });
const expoCli = createRequire(join(uiRoot, 'package.json')).resolve('expo/bin/cli');
const build = sh(process.execPath, [expoCli, 'export', '--platform', 'web', '--output-dir', 'dist-release'], {
    cwd: uiRoot,
    stdio: 'inherit',
    env: { ...process.env, EXPO_UNSTABLE_WEB_MODAL: '1' },
});
if (build.status !== 0) fail('expo export failed');
const indexPath = join(outDir, 'index.html');
if (!existsSync(indexPath)) fail('build produced no index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
const builtMain = mainBundleOf(indexHtml);
if (!builtMain || !existsSync(join(outDir, '_expo', 'static', 'js', 'web', builtMain))) {
    fail('index.html does not reference an emitted main bundle');
}
const indexSha = createHash('sha256').update(readFileSync(indexPath)).digest('hex');
console.log(`  main bundle ${builtMain}`);

// 4. COS upload + verification
step('4/6 upload static assets to COS and verify');
const python = isWindows ? 'python' : 'python3';
const sync = join(repoRoot, 'scripts', 'sync-ui-to-cos.py');
if (sh(python, [sync, '--src', outDir], { cwd: repoRoot, stdio: 'inherit' }).status !== 0) fail('COS upload failed');
const verify = sh(python, [sync, '--src', outDir, '--verify-only'], { cwd: repoRoot });
process.stdout.write(verify.stdout.slice(-600));
if (verify.status !== 0 || !/Verification passed/.test(verify.stdout)) fail('COS verification did not pass');

if (args.has('--no-deploy')) {
    step(`stopped before deploy (--no-deploy). Built ${builtMain} from ${headSha}.`);
    process.exit(0);
}

// 5. server deploy
step('5/6 deploy to server (backup, overwrite in place, index.html last)');
const staging = join(tmpdir(), `kaiwu-release-${Date.now()}`);
mkdirSync(staging, { recursive: true });
const tarball = join(staging, 'ui-dist-assets.tgz');
if (sh(tarBin, ['--exclude=./index.html', '-czf', tarball, '-C', outDir, '.'], { stdio: 'inherit' }).status !== 0) fail('tar failed');
writeFileSync(join(staging, 'index.html.new'), indexHtml);
const upload = sh(scpBin, [...sshOpts, tarball, join(staging, 'index.html.new'), `${SERVER}:/tmp/`], { stdio: 'inherit' });
if (upload.status !== 0) fail('scp to server failed');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backup = `${REMOTE_DIST}.bak-${stamp}-pre-${headSha.slice(0, 10)}`;
const remoteScript = [
    'set -e',
    `cp -a ${REMOTE_DIST} ${backup}`,
    `tar -xzf /tmp/ui-dist-assets.tgz -C ${REMOTE_DIST}`,
    // cat keeps the file inode, so the container's bind mount sees the new index immediately
    `cat /tmp/index.html.new > ${REMOTE_DIST}/index.html`,
    'rm -f /tmp/ui-dist-assets.tgz /tmp/index.html.new',
    `sha256sum ${REMOTE_DIST}/index.html`,
].join('; ');
const deploy = sh(sshBin, [...sshOpts, SERVER, remoteScript]);
rmSync(staging, { recursive: true, force: true });
if (deploy.status !== 0) fail(`remote deploy failed: ${deploy.stderr}`);
if (!deploy.stdout.includes(indexSha)) fail(`served index.html hash mismatch (backup at ${backup})`);
console.log(`  backup ${backup}`);

// 6. live verification
step('6/6 live verification');
const live = await fetch(`${SITE}/`, { cache: 'no-store' }).then((r) => r.text());
if (mainBundleOf(live) !== builtMain) fail(`site serves ${mainBundleOf(live)}, expected ${builtMain}; roll back from ${backup}`);
const redirect = await fetch(`${SITE}/_expo/static/js/web/${builtMain}`, { redirect: 'manual' });
const cosUrl = redirect.headers.get('location');
if (redirect.status !== 302 || !cosUrl) fail(`main bundle is not redirected to COS (status ${redirect.status})`);
const cos = await fetch(cosUrl, { method: 'HEAD' });
if (cos.status !== 200) fail(`COS main bundle returned ${cos.status}`);

const { chromium } = createRequire(join(repoRoot, 'package.json'))('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 300)));
await page.goto(`${SITE}/`, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(15000);
const bodyText = (await page.innerText('body')).trim();
await browser.close();
if (pageErrors.length > 0) fail(`uncaught page errors on the live site:\n  ${pageErrors.join('\n  ')}\n  roll back from ${backup}`);
if (bodyText.length === 0) fail(`live site rendered a blank page; roll back from ${backup}`);

const record = { at: new Date().toISOString(), commit: headSha, mainBundle: builtMain, indexSha256: indexSha, backup };
const recordDir = join(repoRoot, 'logs', 'releases');
mkdirSync(recordDir, { recursive: true });
writeFileSync(join(recordDir, `web-${stamp}.json`), `${JSON.stringify(record, null, 2)}\n`);
step(`DONE: ${builtMain} from ${headSha} is live.`);
console.log(`  rollback: ssh ${SERVER} "cp -a ${backup}/. ${REMOTE_DIST}/ && cat ${backup}/index.html > ${REMOTE_DIST}/index.html"`);
