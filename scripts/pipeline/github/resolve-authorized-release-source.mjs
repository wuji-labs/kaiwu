// @ts-check

import { execFileSync } from '../lib/portable-child-process.mjs';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const FULL_SHA = /^[a-f0-9]{40}$/;
const SAFE_REF = /^(?!.*(?:\.\.|@\{|\/\/))[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function lsRemote(cwd, remoteUrl, ref) {
  const output = git(cwd, ['ls-remote', remoteUrl, ref]);
  if (!output) return null;
  const lines = output.split('\n').filter(Boolean);
  if (lines.length !== 1) throw new Error(`Remote source ref resolved more than once: ${ref}`);
  const sha = lines[0].split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!FULL_SHA.test(sha)) throw new Error(`Remote returned an invalid commit SHA for ${ref}`);
  return sha;
}

/**
 * Resolve an operator-supplied branch, tag, or exact SHA against remote state without executing source bytes.
 * Unqualified branch/tag names that exist in both namespaces fail closed.
 * @param {{ repoRoot: string; remoteUrl: string; sourceRef: string; authorizedSha?: string }} params
 */
export async function resolveAuthorizedReleaseSource(params) {
  const repoRoot = resolve(params.repoRoot);
  const remoteUrl = String(params.remoteUrl ?? '').trim();
  const sourceRef = String(params.sourceRef ?? '').trim();
  const authorizedSha = String(params.authorizedSha ?? '').trim().toLowerCase();
  if (!remoteUrl) throw new Error('release source remote URL is required');
  if (authorizedSha && !FULL_SHA.test(authorizedSha)) {
    throw new Error('Caller-authorized release SHA must be a full 40-character commit id');
  }
  if (FULL_SHA.test(sourceRef) || authorizedSha) {
    const exactSha = authorizedSha || sourceRef;
    try {
      git(repoRoot, ['fetch', '--no-tags', '--depth=1', remoteUrl, exactSha]);
    } catch {
      throw new Error(`Exact authorized release source SHA was not found in the target repository: ${exactSha}`);
    }
    const fetched = git(repoRoot, ['rev-parse', 'FETCH_HEAD']).toLowerCase();
    if (fetched !== exactSha) throw new Error('Fetched release source SHA did not match the authorized input');
    if (authorizedSha && sourceRef && sourceRef !== authorizedSha) {
      const resolvedRef = await resolveAuthorizedReleaseSource({ repoRoot, remoteUrl, sourceRef });
      if (resolvedRef.sha !== authorizedSha) {
        throw new Error(`Source ref did not match caller-authorized SHA: ${sourceRef}`);
      }
    }
    return { sha: fetched, kind: 'sha', canonicalRef: fetched };
  }
  if (!SAFE_REF.test(sourceRef) || sourceRef.startsWith('/') || sourceRef.endsWith('/') || sourceRef.endsWith('.lock')) {
    throw new Error(`Invalid release source ref: ${sourceRef || '<empty>'}`);
  }

  const explicitHead = sourceRef.startsWith('refs/heads/');
  const explicitTag = sourceRef.startsWith('refs/tags/');
  if (sourceRef.startsWith('refs/') && !explicitHead && !explicitTag) {
    throw new Error(`Invalid release source namespace: ${sourceRef}`);
  }
  const branchRef = explicitHead ? sourceRef : `refs/heads/${sourceRef}`;
  const tagRef = explicitTag ? sourceRef : `refs/tags/${sourceRef}`;
  const branchSha = explicitTag ? null : lsRemote(repoRoot, remoteUrl, branchRef);
  const tagSha = explicitHead ? null : (lsRemote(repoRoot, remoteUrl, `${tagRef}^{}`) ?? lsRemote(repoRoot, remoteUrl, tagRef));
  if (branchSha && tagSha) throw new Error(`Ambiguous release source ref exists as both branch and tag: ${sourceRef}`);
  const sha = branchSha ?? tagSha;
  if (!sha) throw new Error(`Release source ref was not found in the target repository: ${sourceRef}`);
  return { sha, kind: branchSha ? 'branch' : 'tag', canonicalRef: branchSha ? branchRef : tagRef };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'source-ref': { type: 'string' },
      remote: { type: 'string', default: 'origin' },
      'github-output': { type: 'string' },
      'authorized-sha': { type: 'string', default: '' },
    },
    allowPositionals: false,
  });
  const result = await resolveAuthorizedReleaseSource({
    repoRoot: process.cwd(),
    remoteUrl: String(values.remote ?? 'origin'),
    sourceRef: String(values['source-ref'] ?? ''),
    authorizedSha: String(values['authorized-sha'] ?? ''),
  });
  const githubOutput = String(values['github-output'] ?? '').trim();
  if (githubOutput) {
    appendFileSync(githubOutput, `authorized_sha=${result.sha}\nsource_kind=${result.kind}\ncanonical_ref=${result.canonicalRef}\n`, 'utf8');
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

const isDirectEntry = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectEntry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
