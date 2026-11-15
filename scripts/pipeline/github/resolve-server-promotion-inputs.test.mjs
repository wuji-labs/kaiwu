import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = new URL('./resolve-server-promotion-inputs.mjs', import.meta.url);

function run(environment, sourceRef, allowCrossPromote) {
  const root = mkdtempSync(join(tmpdir(), 'server-promotion-inputs-'));
  const output = join(root, 'output');
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(script),
      '--environment', environment,
      '--source-ref', sourceRef,
      '--allow-cross-promote', String(allowCrossPromote),
      '--bump', 'none',
      '--github-output', output,
    ],
    { encoding: 'utf8' },
  );
  const written = result.status === 0 ? readFileSync(output, 'utf8') : '';
  rmSync(root, { recursive: true, force: true });
  return { ...result, written };
}

test('cross-promotion is fail-closed for preview and production', () => {
  for (const [environment, expected] of [['preview', 'preview'], ['production', 'main']]) {
    assert.equal(run(environment, expected, false).status, 0);
    const rejected = run(environment, 'arbitrary-feature', false);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /cross-promotion/i);
    assert.equal(run(environment, 'arbitrary-feature', true).status, 0);
  }
});

test('auto resolves to the environment default source', () => {
  for (const [environment, expected] of [['preview', 'preview'], ['production', 'main']]) {
    const root = mkdtempSync(join(tmpdir(), 'server-promotion-inputs-auto-'));
    const output = join(root, 'output');
    execFileSync(process.execPath, [
      fileURLToPath(script),
      '--environment', environment,
      '--source-ref', 'auto',
      '--allow-cross-promote', 'false',
      '--bump', 'none',
      '--github-output', output,
    ]);
    assert.match(readFileSync(output, 'utf8'), new RegExp(`source_ref=${expected}\\n`));
    rmSync(root, { recursive: true, force: true });
  }
});
