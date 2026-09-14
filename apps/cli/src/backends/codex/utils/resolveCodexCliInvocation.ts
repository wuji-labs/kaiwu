import { accessSync, constants as fsConstants, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { expandHomeDirPath, resolveHomeDirFromEnvironment } from '@happier-dev/cli-common/providers';
import { resolveWindowsCommandPath } from '@happier-dev/cli-common/process';

import { requireJavaScriptRuntimeExecutable } from '@/runtime/js/requireJavaScriptRuntimeExecutable';
import { requireProviderCliCommand } from '@/runtime/managedTools/requireProviderCliCommand';
import { resolveProviderCliCommand } from '@/runtime/managedTools/providerCliResolution';
import { isBun } from '@/utils/runtime';

const JAVA_SCRIPT_ENTRYPOINT_EXTENSION = /\.(?:c?js|mjs)$/i;
const JAVA_SCRIPT_SHEBANG = /^#!.*\b(?:env\s+)?(?:node|bun)(?:\s|$)/;

// Kaiwu is the public product name now. Keep the Happier variable as a
// fallback so existing daemon/service environments continue to work.
export const CODEX_APP_SERVER_OVERRIDE_ENV_KEYS = [
    'KAIWU_CODEX_APP_SERVER_BIN',
    'HAPPIER_CODEX_APP_SERVER_BIN',
] as const;

function isJavaScriptBackedCodexCommand(command: string): boolean {
    if (JAVA_SCRIPT_ENTRYPOINT_EXTENSION.test(command)) {
        return true;
    }
    if (!existsSync(command)) {
        return false;
    }
    try {
        const header = readFileSync(command, 'utf8').slice(0, 256);
        const firstLine = header.split(/\r?\n/u, 1)[0] ?? '';
        return JAVA_SCRIPT_SHEBANG.test(firstLine);
    } catch {
        return false;
    }
}

function looksLikePath(value: string): boolean {
    return value.includes('/') || value.includes('\\') || value.startsWith('.') || value.startsWith('~');
}

function expandHomeDir(value: string): string {
    return resolve(value);
}

export function resolveCodexOverrideCommand(
    processEnv: NodeJS.ProcessEnv,
    overrideEnvVarKeys: readonly string[],
    cwd: string,
): string | null {
    for (const key of overrideEnvVarKeys) {
        const value = typeof processEnv[key] === 'string' ? processEnv[key].trim() : '';
        if (!value) continue;

        if (!looksLikePath(value)) {
            return value;
        }

        const expanded = value.startsWith('~')
            ? (() => {
                const expandedHome = expandHomeDirPath(value, processEnv);
                if (expandedHome.length > 0 && expandedHome !== value) {
                    return expandHomeDir(expandedHome);
                }
                return resolve(resolveHomeDirFromEnvironment(processEnv), value.slice(1));
            })()
            : resolve(cwd, value);
        const accessMode =
            JAVA_SCRIPT_ENTRYPOINT_EXTENSION.test(expanded)
                ? fsConstants.R_OK
                : process.platform === 'win32'
                    ? fsConstants.F_OK
                    : fsConstants.X_OK;
        if (process.platform === 'win32') {
            const normalizedExpanded = resolveWindowsCommandPath(expanded, processEnv);
            if (!normalizedExpanded) {
                continue;
            }
            return normalizedExpanded;
        }
        try {
            accessSync(expanded, accessMode);
            if (!statSync(expanded).isFile()) {
                continue;
            }
            return expanded;
        } catch {
            continue;
        }
    }
    return null;
}

function resolveCodexCommand(params: Readonly<{
    processEnv: NodeJS.ProcessEnv;
    overrideEnvVarKeys: readonly string[];
    cwd: string;
}>): string | null {
    return resolveCodexOverrideCommand(params.processEnv, params.overrideEnvVarKeys, params.cwd)
        ?? resolveProviderCliCommand('codex', { processEnv: params.processEnv })?.command
        ?? null;
}

export function resolveCodexAppServerCommand(
    processEnv: NodeJS.ProcessEnv = process.env,
    cwd: string = process.cwd(),
): string | null {
    return resolveCodexCommand({
        processEnv,
        overrideEnvVarKeys: CODEX_APP_SERVER_OVERRIDE_ENV_KEYS,
        cwd,
    });
}

export async function resolveCodexCliInvocation(params: Readonly<{
    args: string[];
    cwd?: string;
    processEnv?: NodeJS.ProcessEnv;
    overrideEnvVarKeys?: readonly string[];
    targetLabel?: string;
}>): Promise<Readonly<{ command: string; args: string[] }>> {
    const processEnv = params.processEnv ?? process.env;
    const cwd = params.cwd ?? process.cwd();
    const command = resolveCodexCommand({
        processEnv,
        overrideEnvVarKeys: params.overrideEnvVarKeys ?? [],
        cwd,
    }) ?? requireProviderCliCommand('codex', { processEnv });

    if (!isJavaScriptBackedCodexCommand(command)) {
        return { command, args: [...params.args] };
    }

    const javaScriptRuntime = await requireJavaScriptRuntimeExecutable({
        isBunRuntime: isBun(),
        processEnv,
        targetLabel: params.targetLabel ?? 'Codex CLI',
    });

    return {
        command: javaScriptRuntime,
        args: [command, ...params.args],
    };
}

export async function resolveCodexAppServerCliInvocation(params: Readonly<{
    args: string[];
    cwd?: string;
    processEnv?: NodeJS.ProcessEnv;
    targetLabel?: string;
}>): Promise<Readonly<{ command: string; args: string[] }>> {
    return await resolveCodexCliInvocation({
        ...params,
        overrideEnvVarKeys: CODEX_APP_SERVER_OVERRIDE_ENV_KEYS,
    });
}
