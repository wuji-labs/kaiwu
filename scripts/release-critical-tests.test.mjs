// Run: node --test scripts/release-critical-tests.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareToBaseline, parseTypecheckErrorsByFile } from './release-critical-tests.mjs';

test('counts tsc errors per file and normalizes Windows separators', () => {
    const output = [
        'sources\\a\\One.tsx(1,2): error TS2345: Argument of type ...',
        'sources/a/One.tsx(9,1): error TS2554: Expected 1 arguments, but got 2.',
        'sources/b/Two.ts(3,4): error TS2578: Unused directive.',
        '  continuation line that is not an error',
        'Found 3 errors.',
    ].join('\n');
    assert.deepEqual(parseTypecheckErrorsByFile(output), {
        'sources/a/One.tsx': 2,
        'sources/b/Two.ts': 1,
    });
});

test('flags files that grow past the baseline and files new to it', () => {
    const baseline = { 'sources/a/One.tsx': 2, 'sources/b/Two.ts': 1 };
    const current = { 'sources/a/One.tsx': 3, 'sources/b/Two.ts': 1, 'sources/c/New.ts': 1 };
    assert.deepEqual(compareToBaseline(current, baseline), [
        { file: 'sources/a/One.tsx', count: 3, allowed: 2 },
        { file: 'sources/c/New.ts', count: 1, allowed: 0 },
    ]);
});

test('accepts equal or shrinking error counts', () => {
    const baseline = { 'sources/a/One.tsx': 2, 'sources/b/Two.ts': 1 };
    assert.deepEqual(compareToBaseline({ 'sources/a/One.tsx': 1 }, baseline), []);
});
