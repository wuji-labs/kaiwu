import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  resolveTypeScriptCliPath,
  resolveTypeScriptCommandInvocation,
} from './typescriptCommand.mjs';

test('resolves the native TypeScript CLI from its exported package manifest', () => {
  const resolutions = [];
  const cliPath = resolveTypeScriptCliPath({
    cwd: '/repo/apps/cli',
    requireResolver(specifier, options) {
      resolutions.push({ specifier, options });
      return '/repo/node_modules/@typescript/native/package.json';
    },
    readFileSyncImpl(path, encoding) {
      assert.equal(path, '/repo/node_modules/@typescript/native/package.json');
      assert.equal(encoding, 'utf8');
      return JSON.stringify({ bin: { tsc: './bin/tsc' } });
    },
  });

  assert.deepEqual(resolutions, [
    {
      specifier: '@typescript/native/package.json',
      options: { paths: [path.resolve('/repo/apps/cli')] },
    },
  ]);
  assert.equal(cliPath, path.resolve('/repo/node_modules/@typescript/native/bin/tsc'));
});

test('rejects a native TypeScript package without a tsc entrypoint', () => {
  assert.throws(
    () => resolveTypeScriptCliPath({
      cwd: '/repo',
      requireResolver: () => '/repo/node_modules/@typescript/native/package.json',
      readFileSyncImpl: () => JSON.stringify({ bin: {} }),
    }),
    /does not declare a tsc binary/i,
  );
});

test('invokes the resolved native TypeScript CLI through the managed Node executable', () => {
  const invocation = resolveTypeScriptCommandInvocation({
    cwd: '/repo/packages/protocol',
    args: ['--noEmit', '-p', 'tsconfig.json'],
    processExecPath: '/managed/node',
    requireResolver: () => '/repo/node_modules/@typescript/native/package.json',
    readFileSyncImpl: () => JSON.stringify({ bin: { tsc: './bin/tsc' } }),
  });

  assert.deepEqual(invocation, {
    command: '/managed/node',
    args: [
      path.resolve('/repo/node_modules/@typescript/native/bin/tsc'),
      '--noEmit',
      '-p',
      'tsconfig.json',
    ],
  });
});
