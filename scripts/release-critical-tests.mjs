#!/usr/bin/env node
// Release gate shared by every Kaiwu release path (web via scripts/release-web.mjs, iOS via
// .github/workflows/build-ios-unsigned.yml). Fail-closed: any failure here blocks the release.
//
// 1. Critical-flow tests: flows whose breakage takes the whole app down (the new-session screen
//    crashed web and iOS with React #185 on 2026-09-26). Only suites known green belong here;
//    adding a red suite would block every release, so fix it first, then add it.
// 2. Typecheck ratchet: apps/ui already carries historical type errors. The ratchet refuses any
//    file whose error count grows past scripts/release-typecheck-baseline.json, so new errors
//    cannot ship while old ones are paid down. Shrink the baseline with --update-baseline after
//    fixing errors; it refuses to grow.
//
// Usage: node scripts/release-critical-tests.mjs [--tests-only] [--typecheck-only] [--update-baseline]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = join(repoRoot, 'apps', 'ui');
const baselinePath = join(repoRoot, 'scripts', 'release-typecheck-baseline.json');

export const CRITICAL_TEST_PATHS = [
    // New-session machine/path selection, draft hydration, launch path recovery.
    'sources/components/sessions/new/hooks/screenModel/',
    // Session-mode labels and control shared by the picker, preflight and actions.
    'sources/sync/domains/sessionControl/sessionModeControl.test.ts',
    'sources/sync/ops/actions/defaultActionExecutor.planMode.test.ts',
    'sources/components/sessions/agentInput/AgentInput.modelOptionsOverride.test.tsx',
];

// Single Vitest processes over many files grow the heap until OOM (see apps/ui/scripts/runVitestShards.mjs).
const SHARDS = 2;

const args = new Set(process.argv.slice(2));

function run(label, command, commandArgs, options = {}) {
    console.log(`\n[release-gate] ${label}`);
    const result = spawnSync(command, commandArgs, { cwd: uiRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
    return result;
}

function runCriticalTests() {
    const vitestEntry = join(dirname(createRequire(join(uiRoot, 'package.json')).resolve('vitest/package.json')), 'vitest.mjs');
    for (let shard = 1; shard <= SHARDS; shard += 1) {
        const result = run(
            `critical tests shard ${shard}/${SHARDS}`,
            process.execPath,
            [vitestEntry, 'run', '--config', 'vitest.config.ts', `--shard=${shard}/${SHARDS}`, ...CRITICAL_TEST_PATHS],
            { stdio: 'inherit' },
        );
        if (result.status !== 0) {
            console.error(`[release-gate] FAIL: critical tests shard ${shard}/${SHARDS} exited ${result.status}`);
            return false;
        }
    }
    console.log('[release-gate] PASS: critical tests');
    return true;
}

export function parseTypecheckErrorsByFile(output) {
    const counts = {};
    for (const line of output.split(/\r?\n/)) {
        const match = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(line.trim());
        if (!match) continue;
        const file = match[1].replace(/\\/g, '/');
        counts[file] = (counts[file] ?? 0) + 1;
    }
    return counts;
}

export function compareToBaseline(current, baseline) {
    const regressions = [];
    for (const [file, count] of Object.entries(current)) {
        const allowed = baseline[file] ?? 0;
        if (count > allowed) regressions.push({ file, count, allowed });
    }
    return regressions;
}

function runTypecheckRatchet() {
    const tscEntry = join(repoRoot, 'scripts', 'workspaces', 'runTypeScriptCli.mjs');
    const result = run('typecheck ratchet (apps/ui)', process.execPath, [tscEntry, '-p', 'tsconfig.json', '--noEmit']);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const current = parseTypecheckErrorsByFile(output);
    const total = Object.values(current).reduce((sum, n) => sum + n, 0);
    if (result.status !== 0 && total === 0) {
        console.error(output.slice(-4000));
        console.error('[release-gate] FAIL: typecheck exited non-zero without parseable errors');
        return false;
    }
    const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')).errorsByFile ?? {} : {};

    if (args.has('--update-baseline')) {
        const grows = compareToBaseline(current, baseline);
        if (existsSync(baselinePath) && grows.length > 0) {
            console.error('[release-gate] refusing to grow the baseline:', grows);
            return false;
        }
        const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
        writeFileSync(baselinePath, `${JSON.stringify({ note: 'Historical apps/ui type errors per file. May only shrink; see scripts/release-critical-tests.mjs.', total, errorsByFile: sorted }, null, 2)}\n`);
        console.log(`[release-gate] baseline written: ${total} errors in ${Object.keys(sorted).length} files`);
        return true;
    }

    const regressions = compareToBaseline(current, baseline);
    if (regressions.length > 0) {
        console.error('[release-gate] FAIL: new type errors beyond baseline:');
        for (const r of regressions) console.error(`  ${r.file}: ${r.count} (baseline ${r.allowed})`);
        const relevant = output.split(/\r?\n/).filter((line) => regressions.some((r) => line.replace(/\\/g, '/').startsWith(r.file)));
        console.error(relevant.slice(0, 40).join('\n'));
        return false;
    }
    console.log(`[release-gate] PASS: typecheck ratchet (${total} errors, none beyond baseline)`);
    return true;
}

function main() {
    const runTests = !args.has('--typecheck-only') && !args.has('--update-baseline');
    const runTypecheck = !args.has('--tests-only');
    if (runTests && !runCriticalTests()) process.exit(1);
    if (runTypecheck && !runTypecheckRatchet()) process.exit(1);
    console.log('\n[release-gate] ALL PASS');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main();
}
