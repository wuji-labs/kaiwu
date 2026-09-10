import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { tailscaleServeHttpsUrlForInternalServerUrlFromStatus } from "@happier-dev/cli-common/tailscale";

import { parseBooleanEnv, parseIntEnv } from "@/config/env";

type TailscaleServeStatusRunner = (params: Readonly<{
    timeoutMs: number;
    env: NodeJS.ProcessEnv;
    tailscaleBin?: string;
}>) => Promise<string>;

const execFileAsync = promisify(execFile);

async function runLocalTailscaleServeStatus(params: Readonly<{
    timeoutMs: number;
    env: NodeJS.ProcessEnv;
    tailscaleBin?: string;
}>): Promise<string> {
    const command = String(params.tailscaleBin ?? params.env.KAIWU_TAILSCALE_BIN ?? "tailscale").trim() || "tailscale";
    const timeoutMs = Math.max(1, Math.min(10_000, Math.trunc(params.timeoutMs)));
    const mergedEnv = { ...process.env, ...params.env };
    const result = await execFileAsync(command, ["serve", "status"], {
        env: mergedEnv,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
    });
    return String(result.stdout ?? "");
}

function resolveTailscaleServeStatusTimeoutMs(env: NodeJS.ProcessEnv): number {
    const raw = String(env.KAIWU_TAILSCALE_SERVE_STATUS_TIMEOUT_MS ?? "").trim();
    return parseIntEnv(raw, 750, { min: 1, max: 10_000 });
}

function resolveApiPort(env: NodeJS.ProcessEnv): number {
    const raw = String(env.PORT ?? "").trim();
    return parseIntEnv(raw, 3005, { min: 1, max: 65_535 });
}

function resolveInternalServerUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
}

function shouldInferFromEnv(env: NodeJS.ProcessEnv): boolean {
    return parseBooleanEnv(env.KAIWU_TAILSCALE_INFER_PUBLIC_URL, true);
}

export async function inferAndApplyTailscaleServePublicServerUrl(
    env: NodeJS.ProcessEnv,
    deps?: Readonly<{ runTailscaleServeStatus?: TailscaleServeStatusRunner }>,
): Promise<string | null> {
    if (String(env.KAIWU_PUBLIC_SERVER_URL ?? "").trim()) return null;
    if (!shouldInferFromEnv(env)) return null;

    const port = resolveApiPort(env);
    const statusTimeoutMs = resolveTailscaleServeStatusTimeoutMs(env);

    try {
        const status = await (deps?.runTailscaleServeStatus ?? runLocalTailscaleServeStatus)({
            timeoutMs: statusTimeoutMs,
            env,
        });
        const inferred = tailscaleServeHttpsUrlForInternalServerUrlFromStatus(
            status,
            resolveInternalServerUrl(port),
        );
        if (!inferred) return null;
        if (String(env.KAIWU_PUBLIC_SERVER_URL ?? "").trim()) return null;
        env.KAIWU_PUBLIC_SERVER_URL = inferred;
        return inferred;
    } catch {
        return null;
    }
}
