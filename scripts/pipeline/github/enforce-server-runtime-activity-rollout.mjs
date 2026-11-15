// @ts-check

import { execFileSync } from '../lib/portable-child-process.mjs';
import fs from 'node:fs';
import { parseArgs } from 'node:util';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readCommitSha(raw, name) {
  const value = String(raw ?? '').trim();
  if (!/^[0-9a-f]{40}$/i.test(value)) {
    fail(`${name} must be a full 40-character Git commit SHA.`);
  }
  return value.toLowerCase();
}

function assertCommitExists(sha, name) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
  } catch {
    fail(`${name} ${sha} is not available as a commit in the candidate checkout.`);
  }
}

function isAncestor(ancestor, candidate) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, candidate], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const { values } = parseArgs({
  options: {
    'rollout-stage': { type: 'string' },
    'candidate-sha': { type: 'string' },
    'minimum-fence-sha': { type: 'string', default: '' },
    'r2-drained-sha': { type: 'string', default: '' },
    'github-output': { type: 'string', default: '' },
  },
  allowPositionals: false,
});

const rolloutStage = String(values['rollout-stage'] ?? '').trim();
if (rolloutStage !== 'pre_activation' && rolloutStage !== 'post_activation') {
  fail('--rollout-stage must be pre_activation or post_activation. Configure the protected release environment explicitly.');
}

const candidateSha = readCommitSha(values['candidate-sha'], '--candidate-sha');
assertCommitExists(candidateSha, 'Candidate');

function publishCandidateSha() {
  const githubOutput = String(values['github-output'] ?? '').trim();
  if (githubOutput) fs.appendFileSync(githubOutput, `candidate_sha=${candidateSha}\n`, 'utf8');
}

if (rolloutStage === 'pre_activation') {
  publishCandidateSha();
  console.log(`Server runtime-activity rollout policy: pre-activation candidate ${candidateSha}.`);
  process.exit(0);
}

const minimumFenceRaw = String(values['minimum-fence-sha'] ?? '').trim();
if (!minimumFenceRaw) {
  fail('Post-activation promotion requires the fence-aware minimum server commit.');
}
const r2DrainedRaw = String(values['r2-drained-sha'] ?? '').trim();
if (!r2DrainedRaw) {
  fail('Post-activation promotion requires the R2 full-fleet drain attestation commit.');
}

const minimumFenceSha = readCommitSha(minimumFenceRaw, '--minimum-fence-sha');
const r2DrainedSha = readCommitSha(r2DrainedRaw, '--r2-drained-sha');
assertCommitExists(minimumFenceSha, 'Fence-aware minimum');
assertCommitExists(r2DrainedSha, 'R2 full-fleet drain attestation');

if (!isAncestor(minimumFenceSha, r2DrainedSha)) {
  fail(`R2 full-fleet drain attestation ${r2DrainedSha} does not contain the fence-aware minimum ${minimumFenceSha}.`);
}
if (!isAncestor(minimumFenceSha, candidateSha)) {
  fail(`Candidate ${candidateSha} does not contain the fence-aware minimum ${minimumFenceSha}.`);
}
if (!isAncestor(r2DrainedSha, candidateSha)) {
  fail(`Candidate ${candidateSha} predates the attested R2 full-fleet drain build ${r2DrainedSha}.`);
}

publishCandidateSha();
console.log(
  `Server runtime-activity rollout policy: post-activation candidate ${candidateSha} contains fence ${minimumFenceSha} and drained R2 build ${r2DrainedSha}.`,
);
