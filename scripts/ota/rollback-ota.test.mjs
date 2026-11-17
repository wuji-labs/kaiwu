import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { planRollback } from './rollback-ota.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rollback-ota.mjs');
const RUNTIME = 'kaiwu-1-native';

const base = {
  platform: 'ios',
  channel: 'production',
  runtimeVersion: RUNTIME,
  now: '2026-11-17T14:00:00.000Z',
  newUpdateId: 'new-id',
};

function update(updateId, createdAt) {
  return { updateId, createdAt, runtimeVersion: RUNTIME, platform: 'ios', channel: 'production', message: updateId };
}

test('default rollback republishes the previous update under a new id', () => {
  const plan = planRollback({
    ...base,
    currentPointer: update('bad', '2026-11-17T11:00:00.000Z'),
    history: [update('good', '2026-10-22T01:00:00.000Z')],
  });

  // Clients launch the newest update they hold, so re-pointing at the old id (already stored with
  // its old createdAt) would never win against the bad update. A fresh id + createdAt does.
  assert.equal(plan.copyFrom, 'good');
  assert.equal(plan.newPointer.updateId, 'new-id');
  assert.equal(plan.newPointer.sourceUpdateId, 'good');
  assert.equal(plan.newPointer.createdAt, base.now);
  assert.equal(plan.history.at(-1).updateId, 'bad');
});

test('default rollback skips rollback directives and republished copies of the current content', () => {
  const plan = planRollback({
    ...base,
    currentPointer: { ...update('copy-of-bad', '2026-11-17T14:08:00.000Z'), sourceUpdateId: 'bad' },
    history: [
      update('good', '2026-10-22T01:00:00.000Z'),
      update('bad', '2026-11-17T11:00:00.000Z'),
      { rollback: true, commitTime: '2026-11-17T13:30:00.000Z', platform: 'ios', channel: 'production' },
    ],
  });

  assert.equal(plan.copyFrom, 'good');
});

test('--to-update-id republishes that update under a new id', () => {
  const plan = planRollback({
    ...base,
    currentPointer: update('bad', '2026-11-17T11:00:00.000Z'),
    history: [],
    toUpdateId: 'older',
  });

  assert.equal(plan.copyFrom, 'older');
  assert.equal(plan.newPointer.updateId, 'new-id');
  assert.equal(plan.newPointer.sourceUpdateId, 'older');
});

test('rollback to embedded is refused unless explicitly allowed', () => {
  const input = {
    ...base,
    currentPointer: update('bad', '2026-11-17T11:00:00.000Z'),
    history: [update('good', '2026-10-22T01:00:00.000Z')],
    toEmbedded: true,
  };

  // 2026-11-17: both rollBackToEmbedded directives served to iOS 0.2.25 were followed by launch
  // crashes (EXC_BAD_ACCESS ~5s after start); serving a normal update again stopped them.
  assert.throws(() => planRollback(input), /embedded/i);

  const plan = planRollback({ ...input, allowEmbeddedDirective: true });
  assert.equal(plan.copyFrom, null);
  assert.equal(plan.newPointer.rollback, true);
  assert.equal(plan.newPointer.commitTime, base.now);
});

test('rollback fails when there is no distinct previous update', () => {
  assert.throws(
    () => planRollback({ ...base, currentPointer: update('only', '2026-11-17T11:00:00.000Z'), history: [] }),
    /previous update/i,
  );
});

test('local target: copies the update directory and swaps the pointer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiwu-ota-rollback-'));
  try {
    const runtimeDir = path.join(root, RUNTIME);
    fs.mkdirSync(path.join(runtimeDir, 'good', '_expo'), { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'good', '_expo', 'bundle.hbc'), 'good-bundle');
    fs.mkdirSync(path.join(runtimeDir, 'bad'), { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'current-ios-production.json'),
      JSON.stringify(update('bad', '2026-11-17T11:00:00.000Z')),
    );
    fs.writeFileSync(
      path.join(runtimeDir, 'history-ios-production.json'),
      JSON.stringify([update('good', '2026-10-22T01:00:00.000Z')]),
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--platform', 'ios', '--channel', 'production', '--runtime-version', RUNTIME, '--target', root],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);

    const pointer = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'current-ios-production.json'), 'utf8'));
    assert.equal(pointer.sourceUpdateId, 'good');
    assert.notEqual(pointer.updateId, 'good');
    assert.equal(
      fs.readFileSync(path.join(runtimeDir, pointer.updateId, '_expo', 'bundle.hbc'), 'utf8'),
      'good-bundle',
    );
    const history = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'history-ios-production.json'), 'utf8'));
    assert.equal(history.at(-1).updateId, 'bad');

    const refused = spawnSync(
      process.execPath,
      [SCRIPT, '--platform', 'ios', '--runtime-version', RUNTIME, '--target', root, '--to-embedded'],
      { encoding: 'utf8' },
    );
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /embedded/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local target: --pause sets the pointer aside and --resume restores it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiwu-ota-pause-'));
  try {
    const runtimeDir = path.join(root, RUNTIME);
    fs.mkdirSync(runtimeDir, { recursive: true });
    const pointerPath = path.join(runtimeDir, 'current-ios-production.json');
    const original = JSON.stringify(update('live', '2026-11-17T11:00:00.000Z'));
    fs.writeFileSync(pointerPath, original);
    const run = (flag) =>
      spawnSync(process.execPath, [SCRIPT, '--platform', 'ios', '--runtime-version', RUNTIME, '--target', root, flag], {
        encoding: 'utf8',
      });

    assert.equal(run('--pause').status, 0);
    // No pointer file is what makes the server answer 204 (no update).
    assert.equal(fs.existsSync(pointerPath), false);
    assert.notEqual(run('--pause').status, 0, 'pausing twice must not silently succeed');

    assert.equal(run('--resume').status, 0);
    assert.equal(fs.readFileSync(pointerPath, 'utf8'), original);
    assert.notEqual(run('--resume').status, 0, 'resuming with nothing paused must fail');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
