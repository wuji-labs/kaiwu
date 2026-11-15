// @ts-check

import { execFileSync } from '../lib/portable-child-process.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

function fail(message) {
  throw new Error(message);
}

function git(args, options = {}) {
  const authHeader = String(process.env.HAPPIER_GIT_AUTHORIZATION_HEADER ?? '');
  const configArgs = ['-c', 'core.hooksPath=/dev/null', ...(authHeader ? ['-c', `http.extraHeader=${authHeader}`] : [])];
  const output = execFileSync('git', [...configArgs, ...args], {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  return typeof output === 'string' ? output.trim() : '';
}

function readPackage(relativePath) {
  const absolutePath = path.resolve(relativePath);
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${relativePath} must be a regular file.`);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'string') {
    fail(`${relativePath} must contain a string version.`);
  }
  return { absolutePath, parsed };
}

function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(version.trim());
  if (!match) fail(`Invalid server semver: ${version}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === 'major') { major += 1; minor = 0; patch = 0; }
  if (bump === 'minor') { minor += 1; patch = 0; }
  if (bump === 'patch') patch += 1;
  return `${major}.${minor}.${patch}`;
}

const { values } = parseArgs({
  options: {
    bump: { type: 'string' },
    'source-branch': { type: 'string' },
    'expected-sha': { type: 'string' },
    remote: { type: 'string', default: 'origin' },
    push: { type: 'string', default: 'true' },
    'github-output': { type: 'string', default: '' },
  },
  allowPositionals: false,
});

const bump = String(values.bump ?? '');
if (!['patch', 'minor', 'major'].includes(bump)) fail('--bump must be patch, minor, or major.');
const sourceBranch = String(values['source-branch'] ?? '');
if (!['dev', 'preview', 'main'].includes(sourceBranch)) fail('--source-branch must be dev, preview, or main.');
const expectedSha = String(values['expected-sha'] ?? '').toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('--expected-sha must be a full Git SHA.');
if (git(['rev-parse', 'HEAD']).toLowerCase() !== expectedSha) fail('Checked-out source does not match --expected-sha.');
if (git(['status', '--porcelain'])) fail('Trusted bump checkout must start clean.');

const paths = ['apps/server/package.json', 'packages/relay-server/package.json'];
const packages = paths.map(readPackage);
if (packages[0].parsed.version !== packages[1].parsed.version) fail('Server package versions must be synchronized before bumping.');
const nextVersion = bumpVersion(packages[0].parsed.version, bump);
for (const entry of packages) {
  entry.parsed.version = nextVersion;
  fs.writeFileSync(entry.absolutePath, `${JSON.stringify(entry.parsed, null, 2)}\n`, 'utf8');
}
const changed = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean).sort();
if (JSON.stringify(changed) !== JSON.stringify([...paths].sort())) fail(`Unexpected trusted bump diff: ${changed.join(', ')}`);
const shouldPush = String(values.push) === 'true';
if (!shouldPush) {
  const githubOutput = String(values['github-output'] ?? '');
  if (githubOutput) fs.appendFileSync(githubOutput, `version=${nextVersion}\n`, 'utf8');
  console.log(`Prepared local trusted server v${nextVersion} transform.`);
  process.exit(0);
}
git(['add', '--', ...paths]);
git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=github-actions[bot]@users.noreply.github.com', 'commit', '-m', `chore(release): bump server to v${nextVersion}`]);
const candidateSha = git(['rev-parse', 'HEAD']).toLowerCase();
git(['push', `--force-with-lease=refs/heads/${sourceBranch}:${expectedSha}`, String(values.remote), `${candidateSha}:refs/heads/${sourceBranch}`], { inherit: true });
const githubOutput = String(values['github-output'] ?? '');
if (githubOutput) fs.appendFileSync(githubOutput, `candidate_sha=${candidateSha}\nversion=${nextVersion}\n`, 'utf8');
console.log(`Prepared trusted server v${nextVersion} at ${candidateSha}.`);
