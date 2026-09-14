import { decodeBase64, encodeBase64, encodeBase64Url } from "@/api/encryption";
import { configuration, reloadConfiguration } from "@/configuration";
import { createHash, randomBytes } from "node:crypto";
import tweetnacl from 'tweetnacl';
import axios from 'axios';
import { displayQRCode } from "./qrcode";
import { delay } from "@/utils/time";
import { writeCredentialsLegacy, readCredentials, readSettings, updateSettings, Credentials, writeCredentialsDataKey } from "@/persistence";
import { generateWebAuthUrl } from "@/api/webAuth";
import { sanitizeServerIdForFilesystem } from "@/server/serverId";
import { openBrowser } from '@/ui/openBrowser';
import { AuthSelector, AuthMethod } from "./ink/AuthSelector";
import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';
import { ensureDaemonRunningForSessionCommand, shouldAutoStartDaemonAfterAuth } from '@/daemon/ensureDaemon';
import { buildConfigureServerLinks, buildTerminalConnectLinks } from '@happier-dev/cli-common/links';
import { tailscaleServeHttpsUrlForInternalServerUrl } from '@/integrations/tailscale/tailscaleServe';
import { isLoopbackHttpServerUrl, isLoopbackServerHost } from '@/server/serverUrlClassification';
import { buildServerUrlReachabilityHintLines } from '@/server/reachability/serverUrlReachabilityHint';
import { decodeJwtPayload } from '@/cloud/decodeJwtPayload';
import {
    createTerminalPairingAuthentication,
    openTerminalProvisioningResponse,
    readTerminalPairingRequirement,
    type TerminalPairingAuthentication,
    type TerminalPairingRequirement,
} from '@/auth/terminalProvisioningResponse';

export type PostTerminalAuthRequestCompatibleResponse =
    | { state: 'requested' }
    | { state: 'authorized' }
    | { state: 'authorized'; token: string; response: string };

function isAuthorizedWithTokenAndResponse(
    value: PostTerminalAuthRequestCompatibleResponse,
): value is Extract<PostTerminalAuthRequestCompatibleResponse, { state: 'authorized'; token: string; response: string }> {
    if (value.state !== 'authorized') return false;
    return (
        'token' in value &&
        typeof (value as any).token === 'string' &&
        'response' in value &&
        typeof (value as any).response === 'string'
    );
}

function shouldAutoInferPublicServerUrl(): boolean {
    const raw = String(process.env.HAPPIER_TAILSCALE_AUTO_PUBLIC_URL ?? '').trim().toLowerCase();
    if (!raw) return true;
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function resolveTailscaleServeStatusTimeoutMs(): number {
    const raw = Number.parseInt(String(process.env.HAPPIER_TAILSCALE_SERVE_STATUS_TIMEOUT_MS ?? ''), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 750;
}

/**
 * How long this terminal will wait for the sign-in to be approved.
 *
 * Unbounded by default, because a person watching a QR code on their desk is
 * not a hung process. Callers that hand this flow a terminal they have to give
 * back — `kaiwu setup`, which runs `auth login` with inherited stdio — ask for
 * a bound with `kaiwu auth login --wait-timeout <seconds>`, which arrives here
 * the same way the poll interval and the auth method already do.
 */
function resolveTerminalAuthWaitTimeoutMs(): number | null {
    const raw = Number.parseInt(String(process.env.HAPPIER_AUTH_WAIT_TIMEOUT_MS ?? ''), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function printServerUrlReachabilityHint(serverUrl: string): void {
    const lines = buildServerUrlReachabilityHintLines(serverUrl);
    if (lines.length === 0) return;
    for (const line of lines) {
        console.log(line);
    }
    console.log('');
}

function printMobileLinkMissingServerUrlHint(params: Readonly<{ serverUrl: string; kind: 'terminalConnect' | 'configureServer' }>): void {
    // eslint-disable-next-line no-console
    console.log('提示：此手机链接未包含中继 URL。');
    if (isLoopbackServerHost(params.serverUrl)) {
        // eslint-disable-next-line no-console
        console.log('你的中继 URL 设置为 localhost，该地址仅可在此电脑上访问。');
        // eslint-disable-next-line no-console
        console.log('请在手机上打开 Kaiwu → 设置 → 中继，并添加手机可访问的 URL（局域网 IP / VPN / Tailscale）。');
        // eslint-disable-next-line no-console
        console.log('建议（推荐）：设置 HAPPIER_PUBLIC_SERVER_URL 为可共享的 https:// URL，以便后续二维码自动包含该地址。');
    } else {
        // eslint-disable-next-line no-console
        console.log('你的手机将使用当前配置的中继（Kaiwu → 设置 → 中继）。');
    }
    // eslint-disable-next-line no-console
    console.log('');
}

async function applyAutoPublicServerUrlFromTailscaleServeBestEffort(): Promise<void> {
    if (!shouldAutoInferPublicServerUrl()) return;
    if (String(process.env.HAPPIER_PUBLIC_SERVER_URL ?? '').trim()) return;

    const serverUrl = String(configuration.serverUrl ?? '').trim();
    const publicServerUrl = String(configuration.publicServerUrl ?? '').trim();
    if (!serverUrl) return;
    if (publicServerUrl && publicServerUrl !== serverUrl) return;
    if (!isLoopbackHttpServerUrl(serverUrl)) return;

    const inferred = await tailscaleServeHttpsUrlForInternalServerUrl({
        internalServerUrl: serverUrl,
        timeoutMs: resolveTailscaleServeStatusTimeoutMs(),
        env: process.env,
    });
    if (!inferred) return;

    process.env.HAPPIER_PUBLIC_SERVER_URL = inferred;
    reloadConfiguration();

    const serverId = String(configuration.activeServerId ?? '').trim();
    if (!serverId) return;

    try {
        await updateSettings((current: any) => {
            const servers = current?.servers && typeof current.servers === 'object' ? current.servers : {};
            const existing = servers[serverId];
            if (!existing || typeof existing !== 'object') return current;

            const existingServerUrl = String((existing as any).serverUrl ?? '').trim();
            if (!existingServerUrl || existingServerUrl !== serverUrl) return current;

            const existingPublic = String((existing as any).publicServerUrl ?? '').trim();
            // Don't override an explicit non-loopback public URL.
            if (existingPublic && existingPublic !== existingServerUrl) return current;

            const now = Date.now();
            return {
                ...current,
                servers: {
                    ...servers,
                    [serverId]: {
                        ...existing,
                        publicServerUrl: inferred,
                        updatedAt: now,
                    },
                },
            };
        });
    } catch {
        // best-effort
    }
}

function rehydrateRelayScopeEnvFromConfiguration(): void {
    const activeServerId = sanitizeServerIdForFilesystem(configuration.activeServerId ?? '', '');
    if (activeServerId) {
        process.env.HAPPIER_ACTIVE_SERVER_ID = activeServerId;
    }

    const serverUrl = String(configuration.serverUrl ?? '').trim();
    if (serverUrl) {
        process.env.HAPPIER_SERVER_URL = serverUrl;
    }

    const publicServerUrl = String(configuration.publicServerUrl ?? '').trim();
    if (publicServerUrl) {
        process.env.HAPPIER_PUBLIC_SERVER_URL = publicServerUrl;
    }

    const webappUrl = String(configuration.webappUrl ?? '').trim();
    if (webappUrl) {
        process.env.HAPPIER_WEBAPP_URL = webappUrl;
    }
}

export async function doAuth(): Promise<Credentials | null> {
    // Ink requires raw mode support; in daemon/non-tty contexts we must never render Ink
    // (it will crash with "Raw mode is not supported on the current process.stdin").
    const hasRawMode = Boolean(process.stdin.isTTY && typeof (process.stdin as any).setRawMode === 'function');
    const isInteractive = Boolean(hasRawMode && process.stdout.isTTY);
    if (isInteractive) {
        console.clear();
    }
    const debugRaw = (process.env.DEBUG ?? '').toString();
    const debugEnabled = Boolean(debugRaw) && debugRaw !== '0' && debugRaw.toLowerCase() !== 'false';

    const envMethodRaw = (process.env.HAPPIER_AUTH_METHOD ?? '').toString().trim().toLowerCase();
    const envMethod = envMethodRaw === 'web' || envMethodRaw === 'browser' ? 'web' : envMethodRaw === 'mobile' ? 'mobile' : null;
    const authMethod: AuthMethod | 'both' | null = envMethod ?? (isInteractive ? await selectAuthenticationMethod() : 'both');
    if (!authMethod) {
        console.log('\n已取消认证。\n');
        process.exit(0);
    }

    await applyAutoPublicServerUrlFromTailscaleServeBestEffort();

    // Generating ephemeral key
    const secret = new Uint8Array(randomBytes(32));
    const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);
    const claimSecret = new Uint8Array(randomBytes(32));
    const claimSecretB64Url = Buffer.from(claimSecret).toString('base64url');
    const claimSecretHash = createHash('sha256').update(Buffer.from(claimSecret)).digest('base64url');
    const pairingRequirement = readTerminalPairingRequirement();
    const pairing = createTerminalPairingAuthentication({
        nowMs: Date.now(),
        randomBytes: (length) => new Uint8Array(randomBytes(length)),
    });

    // Create a new authentication request
    try {
        const publicKey = encodeBase64(keypair.publicKey);
        if (debugEnabled) {
            console.log(`[AUTH DEBUG] Sending auth request to: ${configuration.apiServerUrl}/v1/auth/request`);
            console.log(`[AUTH DEBUG] Public key: ${publicKey.substring(0, 20)}...`);
        }
        await postTerminalAuthRequestCompatible({
            publicKey,
            supportsV2: true,
            claimSecretHash,
        });
        if (debugEnabled) {
            console.log(`[AUTH DEBUG] Auth request sent successfully`);
        }
    } catch (error) {
        if (debugEnabled) {
            console.log(`[AUTH DEBUG] Failed to send auth request:`, error);
        }
        console.log('创建认证请求失败，请稍后重试。');
        return null;
    }

    // Handle authentication based on selected method
    if (authMethod === 'mobile') {
        return await doMobileAuth({ keypair, claimSecret: claimSecretB64Url, pairing, pairingRequirement });
    }
    if (authMethod === 'web') {
        return await doWebAuth({ keypair, claimSecret: claimSecretB64Url, pairing, pairingRequirement });
    }
    return await doBothAuth({ keypair, claimSecret: claimSecretB64Url, pairing, pairingRequirement });
}

function toTerminalConnectPairingContext(pairing: TerminalPairingAuthentication): Readonly<{
    secretB64Url: string;
    createdAtMs: number;
    expiresAtMs: number;
}> {
    return {
        secretB64Url: Buffer.from(pairing.secret).toString('base64url'),
        createdAtMs: pairing.createdAtMs,
        expiresAtMs: pairing.expiresAtMs,
    };
}

async function doBothAuth(params: Readonly<{
    keypair: tweetnacl.BoxKeyPair;
    claimSecret: string;
    pairing: TerminalPairingAuthentication;
    pairingRequirement: TerminalPairingRequirement | null;
}>): Promise<Credentials | null> {
    if (process.stdout.isTTY) {
        console.clear();
    }

    const publicKeyB64Url = encodeBase64Url(params.keypair.publicKey);
    const terminalLinks = buildTerminalConnectLinks({
        webappUrl: configuration.webappUrl,
        serverUrl: configuration.serverUrl,
        publicKeyB64Url,
        pairing: toTerminalConnectPairingContext(params.pairing),
    });
    const terminalMobileEmbedsServerUrl = terminalLinks.mobileUrl.includes('server=');

    console.log('\n认证此电脑\n');
    console.log(`中继 URL: ${configuration.serverUrl}`);
    if (configuration.apiServerUrl !== configuration.serverUrl) {
        console.log(`API URL: ${configuration.apiServerUrl}`);
    }
    console.log(`Web 应用 URL: ${configuration.webappUrl}`);
    console.log('');
    printServerUrlReachabilityHint(configuration.serverUrl);
    console.log('推荐：优先使用手机 App。这样可以更轻松地绑定其他设备。');
    if (params.pairingRequirement === 'v3') {
        console.log('需要进行 v3 身份认证配对。为防止不受信任的中继，请使用原生手机 App 批准；网页配对将信任 Web 应用来源。');
    }
    console.log('');
    console.log('在继续之前：');
    if (terminalMobileEmbedsServerUrl) {
        console.log('- 请确保你的手机/浏览器可以访问二维码/深度链接中包含的中继 URL');
        console.log('- App / 网页端可能会提示你自动切换中继（因为链接中包含 server=...）');
    } else {
        console.log('- 请确保你的手机已配置正确的中继（Kaiwu → 设置 → 中继）');
        console.log('- 提示：设置 HAPPIER_PUBLIC_SERVER_URL 可在后续二维码中嵌入可共享的中继 URL');
    }
    console.log('- 登录（或创建账号）');
    console.log('- 如果你已在其他设备上拥有 Kaiwu 账号，请使用同一账号登录');
    console.log('');

    if (!terminalMobileEmbedsServerUrl) {
        printMobileLinkMissingServerUrlHint({ serverUrl: configuration.serverUrl, kind: 'terminalConnect' });
    }

    const printConfigureLinksRaw = String(process.env.HAPPIER_AUTH_PRINT_CONFIGURE_LINKS ?? '').trim().toLowerCase();
    const printConfigureLinks = ['1', 'true', 'yes', 'on'].includes(printConfigureLinksRaw);
    if (printConfigureLinks) {
        const configureLinks = buildConfigureServerLinks({
            webappUrl: configuration.webappUrl,
            serverUrl: configuration.serverUrl,
        });
        console.log('可选 — 在 App / 网页端配置中继（高级）');
        console.log('网页端（预填 + 确认）：');
        console.log(configureLinks.webUrl);
        console.log('手机 App 深度链接：');
        console.log(configureLinks.mobileUrl);
        console.log('');
        if (!configureLinks.mobileUrl.includes('url=')) {
            printMobileLinkMissingServerUrlHint({ serverUrl: configuration.serverUrl, kind: 'configureServer' });
        }
    }

    console.log('手机 App（推荐）');
    console.log('使用你的 Kaiwu 手机 App 扫描此二维码：\n');
    displayQRCode(terminalLinks.mobileUrl);
    console.log('\n或手动打开此 URL：');
    console.log(terminalLinks.mobileUrl);
    console.log('');

    console.log('网页端（备用）');
    console.log('在已登录 Kaiwu 的浏览器中打开此 URL：');
    console.log(terminalLinks.webUrl);
    console.log('');

    const noOpenRaw = (process.env.HAPPIER_NO_BROWSER_OPEN ?? '').toString().trim();
    const noOpen = Boolean(noOpenRaw) && noOpenRaw !== '0' && noOpenRaw.toLowerCase() !== 'false';
    if (!noOpen && process.stdout.isTTY) {
        try {
            await openBrowser(terminalLinks.webUrl);
        } catch {
            // best-effort
        }
    }

    return await waitForAuthentication(params);
}

async function postTerminalAuthRequestCompatible(params: Readonly<{
    publicKey: string;
    supportsV2?: boolean;
    claimSecretHash?: string;
    timeoutMs?: number;
}>): Promise<PostTerminalAuthRequestCompatibleResponse> {
    try {
        const res = await axios.post<PostTerminalAuthRequestCompatibleResponse>(`${configuration.apiServerUrl}/v1/auth/request`, {
            publicKey: params.publicKey,
            ...(typeof params.supportsV2 === 'boolean' ? { supportsV2: params.supportsV2 } : {}),
            ...(typeof params.claimSecretHash === 'string' ? { claimSecretHash: params.claimSecretHash } : {}),
        }, params.timeoutMs ? { timeout: params.timeoutMs } : undefined);
        return res.data;
    } catch (error: any) {
        const code = error?.response?.status;
        if (code === 400 || code === 422) {
            // Some legacy servers validate request bodies strictly and reject unknown keys.
            // Retry with the minimal legacy payload.
            const res = await axios.post<PostTerminalAuthRequestCompatibleResponse>(`${configuration.apiServerUrl}/v1/auth/request`, {
                publicKey: params.publicKey,
            }, params.timeoutMs ? { timeout: params.timeoutMs } : undefined);
            return res.data;
        }
        throw error;
    }
}

/**
 * Display authentication method selector and return user choice
 */
function selectAuthenticationMethod(): Promise<AuthMethod | null> {
    return new Promise((resolve) => {
        let hasResolved = false;

        const onSelect = (method: AuthMethod) => {
            if (!hasResolved) {
                hasResolved = true;
                app.unmount();
                resolve(method);
            }
        };

        const onCancel = () => {
            if (!hasResolved) {
                hasResolved = true;
                app.unmount();
                resolve(null);
            }
        };

        const app = render(React.createElement(AuthSelector, { onSelect, onCancel }), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    });
}

/**
 * Handle mobile authentication flow
 */
async function doMobileAuth(params: Readonly<{
    keypair: tweetnacl.BoxKeyPair;
    claimSecret: string;
    pairing: TerminalPairingAuthentication;
    pairingRequirement: TerminalPairingRequirement | null;
}>): Promise<Credentials | null> {
    if (process.stdout.isTTY) {
        console.clear();
    }
    console.log('\n手机 App 认证\n');
    console.log(`中继 URL: ${configuration.serverUrl}`);
    if (configuration.apiServerUrl !== configuration.serverUrl) {
        console.log(`API URL: ${configuration.apiServerUrl}`);
    }
    console.log(`Web 应用 URL: ${configuration.webappUrl}\n`);
    printServerUrlReachabilityHint(configuration.serverUrl);
    console.log('推荐：优先使用手机 App。这样可以更轻松地绑定其他设备。');
    if (params.pairingRequirement === 'v3') {
        console.log('需要进行 v3 身份认证配对。为防止不受信任的中继，请使用原生手机 App 批准；网页配对将信任 Web 应用来源。');
    }
    console.log('如果你已在其他设备上拥有 Kaiwu 账号，请使用同一账号登录。\n');

    const publicKeyB64Url = encodeBase64Url(params.keypair.publicKey);
    const terminalLinks = buildTerminalConnectLinks({
        webappUrl: configuration.webappUrl,
        serverUrl: configuration.serverUrl,
        publicKeyB64Url,
        pairing: toTerminalConnectPairingContext(params.pairing),
    });
    const terminalMobileEmbedsServerUrl = terminalLinks.mobileUrl.includes('server=');

    const printConfigureLinksRaw = String(process.env.HAPPIER_AUTH_PRINT_CONFIGURE_LINKS ?? '').trim().toLowerCase();
    const printConfigureLinks = ['1', 'true', 'yes', 'on'].includes(printConfigureLinksRaw);
    if (printConfigureLinks) {
        const configureLinks = buildConfigureServerLinks({
            webappUrl: configuration.webappUrl,
            serverUrl: configuration.serverUrl,
        });
        console.log('可选 — 在 App / 网页端配置中继（高级）');
        console.log('网页端（预填 + 确认）：');
        console.log(configureLinks.webUrl);
        console.log('手机 App 深度链接：');
        console.log(configureLinks.mobileUrl);
        console.log('');
        if (!configureLinks.mobileUrl.includes('url=')) {
            printMobileLinkMissingServerUrlHint({ serverUrl: configuration.serverUrl, kind: 'configureServer' });
        }
    }

    if (!terminalMobileEmbedsServerUrl) {
        printMobileLinkMissingServerUrlHint({ serverUrl: configuration.serverUrl, kind: 'terminalConnect' });
    }

    console.log('使用你的 Kaiwu 手机 App 扫描此二维码：\n');
    displayQRCode(terminalLinks.mobileUrl);

    console.log('\n或手动输入此 URL：');
    console.log(terminalLinks.mobileUrl);
    console.log('');

    console.log('网页端（备用）：');
    console.log(terminalLinks.webUrl);
    console.log('');

    return await waitForAuthentication(params);
}

/**
 * Handle web authentication flow
 */
async function doWebAuth(params: Readonly<{
    keypair: tweetnacl.BoxKeyPair;
    claimSecret: string;
    pairing: TerminalPairingAuthentication;
    pairingRequirement: TerminalPairingRequirement | null;
}>): Promise<Credentials | null> {
    if (process.stdout.isTTY) {
        console.clear();
    }
    console.log('\n网页端认证\n');
    console.log(`当前终端已连接至: ${configuration.serverUrl}`);
    if (configuration.apiServerUrl !== configuration.serverUrl) {
        console.log(`API URL: ${configuration.apiServerUrl}`);
    }
    console.log(`Web 应用 URL: ${configuration.webappUrl}\n`);
    printServerUrlReachabilityHint(configuration.serverUrl);
    if (params.pairingRequirement === 'v3') {
        console.log('需要进行 v3 身份认证配对，但网页配对仍信任 Web 应用来源。若需防范不受信任的中继，请使用原生手机 App。\n');
    }
    console.log('如果你已在其他设备上拥有 Kaiwu 账号，请使用同一账号登录。\n');

    const publicKeyB64Url = encodeBase64Url(params.keypair.publicKey);
    const terminalLinks = buildTerminalConnectLinks({
        webappUrl: configuration.webappUrl,
        serverUrl: configuration.serverUrl,
        publicKeyB64Url,
        pairing: toTerminalConnectPairingContext(params.pairing),
    });
    const webUrl = terminalLinks.webUrl;
    const noOpenRaw = (process.env.HAPPIER_NO_BROWSER_OPEN ?? '').toString().trim();
    const noOpen = Boolean(noOpenRaw) && noOpenRaw !== '0' && noOpenRaw.toLowerCase() !== 'false';
    if (!noOpen) {
        console.log('正在打开浏览器...');

        const browserOpened = await openBrowser(webUrl);

        if (browserOpened) {
            console.log('✓ 浏览器已打开\n');
            console.log('请在浏览器窗口中完成认证。');
        } else {
            console.log('无法自动打开浏览器。');
        }
    } else {
        console.log('自动打开浏览器已禁用（已设置 HAPPIER_NO_BROWSER_OPEN）。');
        console.log('请在你要认证的浏览器配置文件/账号中打开下方 URL。');
    }

    // I changed this to always show the URL because we got a report from
    // someone running happy inside the dev-box container image that they saw the
    // "Complete authentication in your browser window." but nothing opened.
    // https://github.com/slopus/happy/issues/19
    console.log('\n如果浏览器未自动打开，请复制并粘贴此 URL：');
    console.log(webUrl);
    console.log('');
    console.log('如果你想改用手机 App，请手动打开此深度链接：');
    console.log(terminalLinks.mobileUrl);
    console.log('');
    if (!terminalLinks.mobileUrl.includes('server=')) {
        printMobileLinkMissingServerUrlHint({ serverUrl: configuration.serverUrl, kind: 'terminalConnect' });
    }

    return await waitForAuthentication(params);
}

/**
 * Wait for authentication to complete and return credentials
 */
async function waitForAuthentication(params: Readonly<{
    keypair: tweetnacl.BoxKeyPair;
    claimSecret: string;
    pairing: TerminalPairingAuthentication;
    pairingRequirement: TerminalPairingRequirement | null;
}>): Promise<Credentials | null> {
    process.stdout.write('正在等待认证');
    let dots = 0;
    let cancelled = false;

    // Handle Ctrl-C during waiting
    const handleInterrupt = () => {
        cancelled = true;
        console.log('\n\n已取消认证。');
        process.exit(0);
    };

    process.on('SIGINT', handleInterrupt);

    try {
        const pollIntervalMsRaw = Number(process.env.HAPPIER_AUTH_POLL_INTERVAL_MS ?? '');
        const pollIntervalMs = Number.isFinite(pollIntervalMsRaw) && pollIntervalMsRaw > 0 ? pollIntervalMsRaw : 1000;
        const waitTimeoutMs = resolveTerminalAuthWaitTimeoutMs();
        const waitDeadlineMs = waitTimeoutMs === null ? null : Date.now() + waitTimeoutMs;
        const publicKey = encodeBase64(params.keypair.publicKey);

        const remainingRequestTimeoutMs = (): number | undefined => {
            if (waitDeadlineMs === null) return undefined;
            return Math.max(1, waitDeadlineMs - Date.now());
        };
        const waitExpired = (): boolean => waitDeadlineMs !== null && Date.now() >= waitDeadlineMs;
        const printWaitExpired = (): void => {
            console.log('\n\n已停止等待登录批准。');
            console.log('重新运行 `kaiwu auth login` 以创建新的登录请求。');
        };

        let mode: 'status-claim' | 'legacy-post' = 'status-claim';

        while (!cancelled) {
            if (waitExpired()) {
                printWaitExpired();
                return null;
            }
            try {
                const tryFinalizeWithTokenAndEncryptedResponse = async (token: string, responseB64: string): Promise<Credentials | null> => {
                    const r = decodeBase64(responseB64);
                    const opened = openTerminalProvisioningResponse({
                        payload: r,
                        terminalSecretKey: params.keypair.secretKey,
                        terminalPublicKey: params.keypair.publicKey,
                        pairing: params.pairing,
                        requirement: params.pairingRequirement,
                        nowMs: Date.now(),
                    });
                    if (!opened) {
                        console.log(
                            params.pairingRequirement === 'v3'
                                ? '\n\n需要进行 v3 身份认证终端配对。请更新 Kaiwu 手机 App 并扫描新的二维码。'
                                : '\n\n解密响应失败，请重试。',
                        );
                        return null;
                    }

                    if (opened.type === 'legacy') {
                        await writeCredentialsLegacy({ secret: opened.key, token });
                        console.log('\n\n✓ 认证成功\n');
                        return { encryption: { type: 'legacy', secret: opened.key }, token };
                    }

                    const publicKeyBytes = tweetnacl.box.keyPair.fromSecretKey(opened.key).publicKey;
                    await writeCredentialsDataKey({ publicKey: publicKeyBytes, machineKey: opened.key, token });
                    console.log('\n\n✓ 认证成功\n');
                    return { encryption: { type: 'dataKey', publicKey: publicKeyBytes, machineKey: opened.key }, token };
                };

                const legacyPollOnce = async (): Promise<
                    PostTerminalAuthRequestCompatibleResponse
                > => {
                    const data = await postTerminalAuthRequestCompatible({
                        publicKey,
                        supportsV2: true,
                        timeoutMs: remainingRequestTimeoutMs(),
                    });
                    return data;
                };

                if (mode === 'legacy-post') {
                    const legacy = await legacyPollOnce();
                    if (isAuthorizedWithTokenAndResponse(legacy)) {
                        const finalized = await tryFinalizeWithTokenAndEncryptedResponse(legacy.token, legacy.response);
                        if (finalized) return finalized;
                        return null;
                    }
                } else {
                    let statusRes: any;
                    try {
                        statusRes = await axios.get(`${configuration.apiServerUrl}/v1/auth/request/status`, {
                            params: { publicKey },
                            timeout: remainingRequestTimeoutMs(),
                        });
                    } catch (e: any) {
                        const code = e?.response?.status;
                        if (code === 404) {
                            mode = 'legacy-post';
                            const legacy = await legacyPollOnce();
                            if (isAuthorizedWithTokenAndResponse(legacy)) {
                                const finalized = await tryFinalizeWithTokenAndEncryptedResponse(legacy.token, legacy.response);
                                if (finalized) return finalized;
                                return null;
                            }
                            await delay(pollIntervalMs);
                            continue;
                        }
                        throw e;
                    }

                    const status = statusRes.data?.status;
                    if (status === 'not_found') {
                        console.log('\n\n认证请求已过期，请重新运行 `kaiwu auth login`。');
                        return null;
                    }

                    if (status === 'authorized') {
                        try {
                            const claimRes = await axios.post(`${configuration.apiServerUrl}/v1/auth/request/claim`, {
                                publicKey,
                                claimSecret: params.claimSecret,
                            }, { timeout: remainingRequestTimeoutMs() });

                            const claimData = claimRes?.data;
                            if (claimData?.state !== 'authorized') {
                                await delay(pollIntervalMs);
                                continue;
                            }

                            if (typeof claimData.token !== 'string' || typeof claimData.response !== 'string') {
                                console.log('\n\n收到来自中继服务的不符合预期响应，请重试。');
                                return null;
                            }

                            const token = claimData.token;
                            const responseB64 = claimData.response;
                            const finalized = await tryFinalizeWithTokenAndEncryptedResponse(token, responseB64);
                            if (finalized) return finalized;
                            return null;
                        } catch (e: any) {
                            const code = e?.response?.status;
                            const err = e?.response?.data?.error;
                            if (code === 410 && (err === 'expired' || err === 'consumed')) {
                                const message =
                                    err === 'consumed'
                                        ? '认证请求已被认领，请重新运行 `kaiwu auth login`。'
                                        : '认证请求已过期，请重新运行 `kaiwu auth login`。';
                                console.log(`\n\n${message}`);
                                return null;
                            }
                            if (code === 404 || (code === 400 && err === 'claim_not_supported') || (code === 409 && err === 'claim_not_supported')) {
                                mode = 'legacy-post';
                                const legacy = await legacyPollOnce();
                                if (isAuthorizedWithTokenAndResponse(legacy)) {
                                    const finalized = await tryFinalizeWithTokenAndEncryptedResponse(legacy.token, legacy.response);
                                    if (finalized) return finalized;
                                    return null;
                                }
                                await delay(pollIntervalMs);
                                continue;
                            }
                            throw e;
                        }
                    }
                }
            } catch (error) {
                if (waitExpired()) {
                    printWaitExpired();
                    return null;
                }
                console.log('\n\n检查认证状态失败，请重试。');
                return null;
            }

            if (waitExpired()) {
                printWaitExpired();
                return null;
            }

            // Animate waiting dots
            process.stdout.write('\r正在等待认证' + '.'.repeat((dots % 3) + 1) + '   ');
            dots++;

            await delay(pollIntervalMs);
        }
    } finally {
        process.off('SIGINT', handleInterrupt);
    }

    return null;
}

export function decryptWithEphemeralKey(encryptedBundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null {
    // Extract components from bundle: ephemeral public key (32 bytes) + nonce (24 bytes) + encrypted data
    const ephemeralPublicKey = encryptedBundle.slice(0, 32);
    const nonce = encryptedBundle.slice(32, 32 + tweetnacl.box.nonceLength);
    const encrypted = encryptedBundle.slice(32 + tweetnacl.box.nonceLength);

    const decrypted = tweetnacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
    if (!decrypted) {
        return null;
    }

    return decrypted;
}

export async function ensureMachineIdInSettings(opts?: {
    forceNew?: boolean;
    accountId?: string | null;
}): Promise<{ machineId: string }> {
    const forceNew = opts?.forceNew ?? false;
    const accountId = typeof opts?.accountId === 'string' ? opts.accountId.trim() : '';

    const settings = await updateSettings(async s => {
        const activeServerId = sanitizeServerIdForFilesystem(
            configuration.activeServerId ?? s.activeServerId ?? 'cloud',
            'cloud',
        );

        const nextMachineIdByServerId = { ...(s.machineIdByServerId ?? {}) };
        const prevMachineIdForServer = nextMachineIdByServerId[activeServerId];
        const nextLastSubByServerId = { ...(s.lastTokenSubByServerId ?? {}) };
        const nextConfirmed = { ...(s.machineIdConfirmedByServerByServerId ?? {}) };
        const hadLastSub = activeServerId in nextLastSubByServerId;
        const hadConfirmed = activeServerId in nextConfirmed;

        if (!accountId) {
            const current = prevMachineIdForServer;
            if (hadLastSub) delete nextLastSubByServerId[activeServerId];
            if (hadConfirmed) delete nextConfirmed[activeServerId];

            if (forceNew || !current) {
                const machineId = randomUUID();
                nextMachineIdByServerId[activeServerId] = machineId;
                return {
                    ...s,
                    machineIdByServerId: nextMachineIdByServerId,
                    lastTokenSubByServerId: nextLastSubByServerId,
                    machineIdConfirmedByServerByServerId: nextConfirmed,
                    // derived (not persisted in v5+)
                    machineId,
                };
            }

            if (!hadLastSub && !hadConfirmed) {
                return {
                    ...s,
                    machineId: current,
                };
            }

            return {
                ...s,
                lastTokenSubByServerId: nextLastSubByServerId,
                machineIdConfirmedByServerByServerId: nextConfirmed,
                // derived (not persisted in v5+)
                machineId: current,
            };
        }

        const previousAccountId = typeof nextLastSubByServerId[activeServerId] === 'string'
            ? String(nextLastSubByServerId[activeServerId]).trim()
            : '';

        const nextMachineIdByServerIdByAccountId = { ...(s.machineIdByServerIdByAccountId ?? {}) };
        const currentPerAccount = { ...(nextMachineIdByServerIdByAccountId[activeServerId] ?? {}) };
        const perAccountMachineId = typeof currentPerAccount[accountId] === 'string' ? String(currentPerAccount[accountId]).trim() : '';

        const didAccountSwap = Boolean(previousAccountId && previousAccountId !== accountId);

        let machineId: string | null = null;
        if (!forceNew && perAccountMachineId) {
            machineId = perAccountMachineId;
        } else if (!forceNew && !didAccountSwap && prevMachineIdForServer && typeof prevMachineIdForServer === 'string' && prevMachineIdForServer.trim()) {
            // Backfill mapping for older CLIs that only stored machineIdByServerId.
            machineId = prevMachineIdForServer.trim();
        }

        if (!machineId) {
            machineId = randomUUID();
        }

        const normalizedPrevMachineId = typeof prevMachineIdForServer === 'string' && prevMachineIdForServer.trim()
            ? prevMachineIdForServer.trim()
            : null;
        const needsServerMachineIdUpdate = normalizedPrevMachineId !== machineId;
        const needsLastSubUpdate = previousAccountId !== accountId;
        const needsPerAccountUpdate = perAccountMachineId !== machineId;

        const needsConfirmedUpdate = (needsServerMachineIdUpdate || needsLastSubUpdate) && activeServerId in nextConfirmed;

        if (!needsServerMachineIdUpdate && !needsLastSubUpdate && !needsPerAccountUpdate && !needsConfirmedUpdate) {
            return s;
        }

        nextMachineIdByServerId[activeServerId] = machineId;
        nextLastSubByServerId[activeServerId] = accountId;
        currentPerAccount[accountId] = machineId;
        nextMachineIdByServerIdByAccountId[activeServerId] = currentPerAccount;

        if (needsConfirmedUpdate) delete nextConfirmed[activeServerId];

        return {
            ...s,
            machineIdByServerId: nextMachineIdByServerId,
            lastTokenSubByServerId: nextLastSubByServerId,
            machineIdByServerIdByAccountId: nextMachineIdByServerIdByAccountId,
            machineIdConfirmedByServerByServerId: nextConfirmed,
            // derived (not persisted in v5+)
            machineId,
        };
    });

    if (!settings.machineId) throw new Error('Failed to ensure machine id in settings');
    return { machineId: settings.machineId };
}

export async function ensureMachineIdForCredentials(
    credentials: Credentials,
    opts?: { forceNew?: boolean },
): Promise<{ machineId: string }> {
    let tokenPayload: Record<string, unknown> | null = null;
    try {
        tokenPayload = decodeJwtPayload(credentials.token);
    } catch {
        tokenPayload = null;
    }
    const accountId = typeof tokenPayload?.sub === 'string' ? tokenPayload.sub.trim() : null;

    let previousAccountId: string | null = null;
    let activeServerIdForLog: string | null = null;
    if (accountId) {
        try {
            const settings = await readSettings();
            const activeServerId = sanitizeServerIdForFilesystem(
                configuration.activeServerId ?? settings.activeServerId ?? 'cloud',
                'cloud',
            );
            activeServerIdForLog = activeServerId;
            const prev = settings.lastTokenSubByServerId?.[activeServerId];
            previousAccountId = typeof prev === 'string' ? prev.trim() : null;
        } catch {
            // best-effort only
        }
    }

    const ensured = await ensureMachineIdInSettings({
        accountId,
        forceNew: Boolean(opts?.forceNew) && !accountId,
    });
    if (accountId && previousAccountId && previousAccountId !== accountId) {
        logger.info(
            `[AUTH] tokenSub changed for server=${activeServerIdForLog ?? 'unknown'} machineId=${ensured.machineId} (account ids redacted)`,
        );
    }

    return ensured;
}


/**
 * Ensure authentication and machine setup
 * This replaces the onboarding flow and ensures everything is ready
 */
export async function authAndSetupMachineIfNeeded(): Promise<{
    credentials: Credentials;
    machineId: string;
}> {
    logger.debug('[AUTH] Starting auth and machine setup...');

    // Step 1: Handle authentication
    let credentials = await readCredentials();
    let newAuth = false;

    if (!credentials) {
        logger.debug('[AUTH] No credentials found, starting authentication flow...');
        const authResult = await doAuth();
        if (!authResult) {
            throw new Error('Authentication failed or was cancelled');
        }
        credentials = authResult;
        newAuth = true;
    } else {
        logger.debug('[AUTH] Using existing credentials');
    }

    // Make sure we have a machine ID.
    // Server machine entity will be created either by the daemon or by the CLI.
    const { machineId } = await ensureMachineIdForCredentials(credentials, { forceNew: newAuth });

    logger.debug(`[AUTH] Machine ID: ${machineId}`);
    rehydrateRelayScopeEnvFromConfiguration();

    if (
      shouldAutoStartDaemonAfterAuth({
        env: process.env,
        isDaemonProcess: configuration.isDaemonProcess,
        startedBy: 'terminal',
      })
    ) {
      try {
        await ensureDaemonRunningForSessionCommand();
      } catch (e) {
        // Non-fatal: the session can still run without daemon, but remote spawn/control will be degraded.
        logger.debug('[AUTH] Failed to auto-start daemon (non-fatal)', e);
      }
    }

    return { credentials, machineId };
}
