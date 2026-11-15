import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const scriptPath = resolve(repoRoot, 'scripts/pipeline/github/publish-release.mjs');
const targetSha = '0123456789abcdef0123456789abcdef01234567';

function writeExecutable(path, source) {
  writeFileSync(path, source, { encoding: 'utf8', mode: 0o755 });
  chmodSync(path, 0o755);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'immutable-release-'));
  const bin = join(root, 'bin');
  const local = join(root, 'local');
  const remote = join(root, 'remote');
  mkdirSync(bin);
  mkdirSync(local);
  mkdirSync(remote);
  writeFileSync(join(local, 'archive.tar.gz'), 'authorized bytes\n');
  writeFileSync(join(local, 'checksums.txt'), 'checksums\n');
  writeFileSync(join(remote, 'archive.tar.gz'), 'different bytes\n');
  const log = join(root, 'gh.log');
  writeFileSync(log, '');
  writeExecutable(
    join(bin, 'gh'),
    `#!/bin/sh
set -eu
echo "gh $*" >> ${JSON.stringify(log)}
if [ "$1" = "api" ]; then
  printf '%s\\n' ${JSON.stringify(targetSha)}
  exit 0
fi
if [ "$1" = "release" ] && [ "$2" = "view" ]; then
  if echo "$*" | grep -q -- "--json assets"; then
    for file in ${JSON.stringify(remote)}/*; do
      [ -e "$file" ] || continue
      basename "$file"
    done
  fi
  exit 0
fi
if [ "$1" = "release" ] && [ "$2" = "download" ]; then
  pattern=""
  destination=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --pattern) pattern="$2"; shift 2 ;;
      --dir) destination="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  mkdir -p "$destination"
  cp ${JSON.stringify(remote)}/"$pattern" "$destination"/
  exit 0
fi
if [ "$1" = "release" ] && [ "$2" = "upload" ]; then
  cp "$4" ${JSON.stringify(remote)}/"$(basename "$4")"
  exit 0
fi
exit 0
`,
  );
  return { root, bin, local, remote, log };
}

function args(local) {
  return [
    scriptPath,
    '--tag', 'cli-v1.2.3-preview.4',
    '--title', 'Happier CLI v1.2.3-preview.4',
    '--target-sha', targetSha,
    '--prerelease', 'true',
    '--rolling-tag', 'false',
    '--generate-notes', 'true',
    '--assets-dir', local,
    '--clobber', 'false',
    '--prune-assets', 'false',
  ];
}

test('an existing immutable release rejects different bytes and a retry only fills missing assets', () => {
  const testFixture = fixture();
  const env = {
    ...process.env,
    GH_REPO: 'test/test',
    PATH: `${testFixture.bin}:${process.env.PATH ?? ''}`,
  };
  try {
    const mismatched = spawnSync(process.execPath, args(testFixture.local), {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(mismatched.status, 0);
    assert.match(`${mismatched.stdout}\n${mismatched.stderr}`, /immutable|different|mismatch/i);
    assert.doesNotMatch(readFileSync(testFixture.log, 'utf8'), /release upload/);

    writeFileSync(join(testFixture.remote, 'archive.tar.gz'), 'authorized bytes\n');
    writeFileSync(testFixture.log, '');
    execFileSync(process.execPath, args(testFixture.local), {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    const retryLog = readFileSync(testFixture.log, 'utf8');
    assert.match(retryLog, /release upload cli-v1\.2\.3-preview\.4 .*checksums\.txt/);
    assert.doesNotMatch(retryLog, /release upload cli-v1\.2\.3-preview\.4 .*archive\.tar\.gz/);
    assert.equal(readFileSync(join(testFixture.remote, basename('archive.tar.gz')), 'utf8'), 'authorized bytes\n');
    assert.equal(readFileSync(join(testFixture.remote, basename('checksums.txt')), 'utf8'), 'checksums\n');
  } finally {
    rmSync(testFixture.root, { recursive: true, force: true });
  }
});
