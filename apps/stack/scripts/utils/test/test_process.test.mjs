import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS,
  buildNodeTestArgs,
  resolveStackUnitTestTimeoutMs,
} from './test_process.mjs';

test('buildNodeTestArgs preserves native node --test file execution for unit lanes', () => {
  assert.deepEqual(buildNodeTestArgs(['/tmp/a.test.mjs', '/tmp/b.test.mjs']), [
    '--test',
    '/tmp/a.test.mjs',
    '/tmp/b.test.mjs',
  ]);
});

test('buildNodeTestArgs adds serial concurrency flag only when requested', () => {
  assert.deepEqual(buildNodeTestArgs(['/tmp/a.integration.test.mjs'], { serial: true }), [
    '--test',
    '--test-concurrency=1',
    '/tmp/a.integration.test.mjs',
  ]);
});

test('buildNodeTestArgs bounds each test and forces file exit when requested', () => {
  assert.deepEqual(buildNodeTestArgs(['/tmp/a.test.mjs'], { serial: true, testTimeoutMs: 1500, forceExit: true }), [
    '--test',
    '--test-concurrency=1',
    '--test-timeout=1500',
    '--test-force-exit',
    '/tmp/a.test.mjs',
  ]);
  assert.deepEqual(buildNodeTestArgs(['/tmp/a.test.mjs'], { testTimeoutMs: 0 }), ['--test', '/tmp/a.test.mjs']);
});

test('resolveStackUnitTestTimeoutMs defaults to a bounded timeout and honors overrides', () => {
  assert.equal(resolveStackUnitTestTimeoutMs({}), DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS);
  assert.ok(DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS > 0);
  assert.equal(resolveStackUnitTestTimeoutMs({ KAIWU_STACK_TEST_TIMEOUT_MS: '1234' }), 1234);
  assert.equal(resolveStackUnitTestTimeoutMs({ HAPPIER_STACK_TEST_TIMEOUT_MS: '4321' }), 4321);
  assert.equal(
    resolveStackUnitTestTimeoutMs({ KAIWU_STACK_TEST_TIMEOUT_MS: '10', HAPPIER_STACK_TEST_TIMEOUT_MS: '20' }),
    10,
  );
  assert.equal(resolveStackUnitTestTimeoutMs({ KAIWU_STACK_TEST_TIMEOUT_MS: '0' }), 0);
  assert.equal(resolveStackUnitTestTimeoutMs({ KAIWU_STACK_TEST_TIMEOUT_MS: 'nope' }), DEFAULT_STACK_UNIT_TEST_TIMEOUT_MS);
});
