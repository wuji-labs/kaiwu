const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { expandHomeDirPath } = require('@happier-dev/cli-common/expandHomeDirPath');
const { withWindowsHide } = require('./childProcessOptions.cjs');

function resolvePathSafe(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return fs.realpathSync(filePath);
    } catch {
        return filePath;
    }
}

function shouldLogClaudeDetection() {
    const raw = ((process.env.HAPPIER_DEBUG_CLAUDE_LAUNCHER ?? process.env.DEBUG) || '').toString().trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower === '0' || lower === 'false' || lower === 'off' || lower === 'no') return false;
    return true;
}

function getClaudeCliPath() {
    const happierOverrideRaw = (process.env.HAPPIER_CLAUDE_PATH || '').trim();
    const happyOverrideRaw = (process.env.HAPPY_CLAUDE_PATH || '').trim();
    const envVarName = happierOverrideRaw ? 'HAPPIER_CLAUDE_PATH' : happyOverrideRaw ? 'HAPPY_CLAUDE_PATH' : null;
    const overrideRaw = (happierOverrideRaw || happyOverrideRaw || '').trim();
    if (overrideRaw) {
        if (overrideRaw === 'claude') {
            if (shouldLogClaudeDetection()) {
                console.error(`\x1b[90m正在使用 ${envVarName ?? 'HAPPIER_CLAUDE_PATH'}=claude 中的 Claude Code\x1b[0m`);
            }
            return 'claude';
        }

        const expandedOverride = expandHomeDirPath(overrideRaw);
        const resolvedOverride = resolvePathSafe(expandedOverride) || expandedOverride;
        if (!fs.existsSync(resolvedOverride)) {
            console.error(`\n\x1b[1m\x1b[33m未找到 Claude Code 路径\x1b[0m\n`);
            console.error(`${envVarName ?? 'HAPPIER_CLAUDE_PATH'} 指向的文件不存在：${overrideRaw}\n`);
            process.exit(1);
        }

        if (shouldLogClaudeDetection()) {
            console.error(`\x1b[90m正在使用 ${envVarName ?? 'HAPPIER_CLAUDE_PATH'} 中的 Claude Code（${resolvedOverride}）\x1b[0m`);
        }
        return resolvedOverride;
    }

    if (shouldLogClaudeDetection()) {
        console.error('\x1b[90m正在使用 PATH 中的 Claude Code（claude）\x1b[0m');
    }
    return 'claude';
}

function isWindowsShellShimPath(filePath) {
    const lower = (filePath || '').toString().toLowerCase();
    return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

function buildClaudeBinarySpawnInvocation(params) {
    const platform = params.platform || process.platform;
    const cliPath = (params.cliPath || '').toString();
    const args = Array.isArray(params.args) ? params.args : [];

    if (platform === 'win32') {
        const forceViaComspecRaw = (process.env.HAPPIER_WINDOWS_CLAUDE_SPAWN_VIA_CMDSPEC || '').toString().trim().toLowerCase();
        const forceViaComspec =
            forceViaComspecRaw.length > 0 &&
            forceViaComspecRaw !== '0' &&
            forceViaComspecRaw !== 'false' &&
            forceViaComspecRaw !== 'off' &&
            forceViaComspecRaw !== 'no';

        if (forceViaComspec || isWindowsShellShimPath(cliPath)) {
            const comspec = (params.comspec || process.env.ComSpec || 'cmd.exe').toString();
            return {
                command: comspec,
                args: ['/d', '/s', '/c', cliPath, ...args],
            };
        }
    }

    return { command: cliPath, args };
}

function attachChildSignalForwarding(child, proc = process) {
    const forwardSignal = (signal) => {
        try {
            if (child && child.pid && !child.killed) {
                child.kill(signal);
            }
        } catch {
            // ignore
        }
    };

    const signals = ['SIGTERM', 'SIGINT'];
    if (proc.platform !== 'win32') {
        signals.push('SIGHUP');
    }

    for (const signal of signals) {
        proc.on(signal, () => forwardSignal(signal));
    }
}

function runClaudeCli(cliPath) {
    const isJsFile = cliPath.endsWith('.js') || cliPath.endsWith('.cjs') || cliPath.endsWith('.mjs');

    if (isJsFile) {
        const importUrl = pathToFileURL(cliPath).href;
        import(importUrl);
        return;
    }

    const args = process.argv.slice(2);
    const invocation = buildClaudeBinarySpawnInvocation({ cliPath, args });
    const child = spawn(invocation.command, invocation.args, withWindowsHide({
        stdio: 'inherit',
        env: process.env,
    }));

    attachChildSignalForwarding(child);
    child.on('exit', (code) => {
        process.exit(code || 0);
    });
}

module.exports = {
    attachChildSignalForwarding,
    buildClaudeBinarySpawnInvocation,
    expandHomeDirPath,
    getClaudeCliPath,
    runClaudeCli,
};
