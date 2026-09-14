/**
 * `kaiwu setup` — the guided first run.
 *
 * Fresh interactive installs hand off here after the binary is ready. This asks
 * the one question the client cannot answer for itself: where the relay lives.
 * Everything else delegates to commands that already exist.
 *
 * The decision logic lives in `./setupPlan` so it can be tested without a
 * terminal; this file owns prompting and delegation only.
 */

import { AGENT_IDS, type AgentId } from '@happier-dev/agents';
import {
    resolveTailscaleInstallStrategy,
    type TailscaleStatusSnapshot,
} from '@happier-dev/cli-common/tailscale';

import { resolveActiveServerAuthReadiness } from '@/auth/resolveActiveServerAuthReadiness';
import type { CommandContext } from '@/cli/commandRegistry';
import { readTailscaleStatusSnapshot } from '@/integrations/tailscale/tailscaleStatus';
import { resolveProviderCliCommand } from '@/runtime/managedTools/providerCliResolution';
import { getActiveServerProfile } from '@/server/serverProfiles';
import { isLoopbackServerHost } from '@/server/serverUrlClassification';
import { promptConfirmYesNo } from '@/terminal/prompts/promptConfirmYesNo';
import { isInteractiveTerminal, promptInput } from '@/terminal/prompts/promptInput';
import { promptMultipleChoice } from '@/terminal/prompts/promptMultipleChoice';
import { openBrowser } from '@/ui/openBrowser';
import { spawnHappyCLI } from '@/utils/spawnHappyCLI';

import { defaultNameFromUrl } from './server/commandUtilities';
import {
    DEFER_SERVER_SELECTION_FOLLOW_UP_ENV,
    reconcileDefaultFollowingBackgroundServicesAfterAuthentication,
} from './backgroundServiceFollowUp';
import {
    buildSetupPlan,
    parseSetupArgs,
    type SetupAutonomy,
    type SetupRelayReachability,
    type SetupRelaySelection,
    type SetupStep,
} from './setupPlan';

/**
 * What setup hands its children when nobody is watching.
 *
 * `isInteractiveTerminal()` answers from the controlling terminal, and a script
 * that runs `kaiwu setup --yes` from a shell still has one — so a child left
 * to decide for itself will happily prompt for a relay profile name nobody is
 * going to type. `HAPPIER_NONINTERACTIVE=1` is the signal the installers
 * already use to mean exactly this, and the CLI's one reader of it is
 * `isInteractiveTerminal()`, so setting it here settles every child at once.
 */
const UNATTENDED_CHILD_ENV: NodeJS.ProcessEnv = { HAPPIER_NONINTERACTIVE: '1' };

const HELP = `kaiwu setup — 连接此电脑到你的 Kaiwu 账号

用法:
  kaiwu setup [options]

选项:
  --cloud                 无需询问直接使用 Kaiwu Cloud
  --relay <url>           使用你已在运行的中继服务
  --this-computer         在此电脑上安装并使用中继服务
  --yes                   不作询问。自动执行所有无需交互确认的步骤，并在
                          需要通过手机或浏览器批准的登录环节暂停，同时显示
                          用于完成登录的命令。必须搭配 --cloud/--relay/--this-computer
                          之一使用：setup 绝不会替你擅自选择中继。退出码非零，
                          因为在完成登录之前设置流程尚未结束。
  --non-interactive       不作任何更改。打印所需信息并以非零状态退出。这也是
                          setup 处理 HAPPIER_NONINTERACTIVE=1 及无终端环境的
                          运行方式。
  -h, --help              显示此帮助信息

设置会询问中继服务部署在哪里，将此电脑指向该中继，并引导你完成登录。
你的账号保存在所选的中继服务上，因此该配置在登录前即已确定。
`;

async function listInstalledAgentIds(): Promise<AgentId[]> {
    const installed: AgentId[] = [];
    for (const agentId of AGENT_IDS) {
        // `customAcp` is a family, not an installable CLI.
        if (agentId === 'customAcp') continue;
        try {
            if (resolveProviderCliCommand(agentId, {})) installed.push(agentId);
        } catch {
            // A resolver failure means "not usable here", which is what we asked.
        }
    }
    return installed;
}

async function readActiveRelayUrl(): Promise<string | null> {
    const profile = await getActiveServerProfile().catch(() => null);
    const url = String(profile?.serverUrl ?? '').trim();
    return url || null;
}

function describeTailscaleState(reachability: SetupRelayReachability): string {
    if (reachability.kind === 'tailnet') {
        return reachability.tailnetName
            ? `Tailscale 正在此电脑上运行（tailnet: ${reachability.tailnetName}）。`
            : 'Tailscale 正在此电脑上运行。';
    }
    if (reachability.kind === 'tailscaleNotRunning') {
        return 'Tailscale 已在此电脑上安装但未运行。';
    }
    return '此电脑上未安装 Tailscale。';
}

function printRelayReachabilityIntro(reachability: SetupRelayReachability): void {
    console.log('');
    console.log('中继服务将运行在此电脑上，你的手机需要通过网络访问它。');
    console.log(describeTailscaleState(reachability));
    if (reachability.kind === 'tailnet') {
        console.log('安装完成后，只需运行一条命令即可将其发布到你的 tailnet。');
    } else if (reachability.kind === 'tailscaleNotRunning') {
        console.log('在它启动运行之前，你的 tailnet 地址后面没有任何正在运行的服务。');
    } else {
        console.log('如果不安装 Tailscale，除非你已拥有可用的 HTTPS 地址，');
        console.log('否则该中继仅能在此电脑上访问。');
    }
    console.log('');
}

/**
 * What is left to do, stated per Tailscale state.
 *
 * `relay host install` already settles which address the relay profile uses and
 * warns when that address is local-only. What it never says is anything about
 * Tailscale itself — above all that an installed-but-stopped Tailscale is why no
 * tailnet address was on offer. That is the gap this fills, so nothing here
 * restates or second-guesses the address the install chose.
 */
async function printRelayReachabilityNextSteps(reachability: SetupRelayReachability): Promise<void> {
    const relayUrl = await readActiveRelayUrl();

    console.log('');
    if (relayUrl && !isLoopbackServerHost(relayUrl)) {
        console.log(`中继服务已就绪，地址: ${relayUrl}`);
        console.log('');
        return;
    }

    console.log('此中继仅可从此电脑访问。');
    if (reachability.kind === 'tailscaleNotRunning') {
        console.log('Tailscale 已在此处安装但未运行，因此你的 tailnet 地址上没有任何服务。');
        console.log('启动 Tailscale 并重新运行安装流程以发布此中继：');
        console.log('');
        console.log('  tailscale up');
        console.log('  kaiwu relay host install');
        console.log('');
        return;
    }
    if (reachability.kind === 'tailnet') {
        console.log('Tailscale 正在运行，但中继尚未发布到 tailnet 上。');
        console.log('重新运行标准安装命令以重试或查看 Tailscale 结果：');
        console.log('');
        console.log('  kaiwu relay host install');
        console.log('');
        return;
    }
    console.log('如果你已经拥有它的 HTTPS 地址，请将 Kaiwu 指向该地址：');
    console.log('');
    console.log('  kaiwu server add --server-url https://relay.example.com --use');
    console.log('');
}

/**
 * Offer, never assume. Installing a VPN on someone's machine is not a detail to
 * slip into a setup flow, so the default is "no".
 */
async function offerTailscaleSetup(): Promise<void> {
    const wanted = await promptConfirmYesNo(
        '立即配置 Tailscale？它将为此电脑提供一个手机可访问的专用私有地址。',
        { default: 'no' },
    );
    if (!wanted) {
        console.log('已跳过。Setup 继续进行；你随时可以稍后配置。');
        return;
    }

    const strategy = resolveTailscaleInstallStrategy(process.platform);
    console.log('');
    if (strategy.kind === 'downloadAndLaunch') {
        console.log(`正在打开 ${strategy.docsUrl}`);
        const opened = await openBrowser(strategy.docsUrl);
        if (!opened) {
            console.log('请打开该页面下载并安装 Tailscale。');
        }
    } else {
        // There is no installer this CLI owns on this platform, and package
        // managers differ per distribution. The docs page beats pretending.
        console.log(`请为此平台安装 Tailscale: ${strategy.docsUrl}`);
    }

    console.log('');
    console.log('安装并登录 Tailscale 后，通过与 setup 相同的检查流程');
    console.log('让中继安装程序发布并选择地址：');
    console.log('');
    console.log('  tailscale up');
    console.log('  kaiwu relay host install');
    console.log('');
}

/**
 * How long setup waits for the sign-in to be approved before handing the
 * terminal back.
 *
 * Long enough to unlock a phone, open the app and approve; short enough that a
 * browser that never opened does not leave an installer-invoked setup holding a
 * terminal nobody is watching. `auth login` owns the wait and prints how to
 * finish it — setup only says how long it is prepared to block.
 */
const AUTH_WAIT_TIMEOUT_SECONDS = 300;

/**
 * Setup bounds how long its child may occupy the terminal. Authentication owns
 * method selection because only it knows whether this invocation creates a new
 * request or merely repairs machine registration from an existing credential.
 */
function resolveAuthLoginArgv(): readonly string[] {
    return ['auth', 'login', '--wait-timeout', String(AUTH_WAIT_TIMEOUT_SECONDS)];
}

async function runCliStep(
    args: readonly string[],
    params: Readonly<{ unattended: boolean; deferServerSelectionFollowUp?: boolean }>,
): Promise<number> {
    return await new Promise<number>((resolve) => {
        const extraEnv: NodeJS.ProcessEnv = {
            ...(params.unattended ? UNATTENDED_CHILD_ENV : {}),
            ...(params.deferServerSelectionFollowUp ? { [DEFER_SERVER_SELECTION_FOLLOW_UP_ENV]: '1' } : {}),
        };
        const child = spawnHappyCLI([...args], {
            stdio: 'inherit',
            ...(Object.keys(extraEnv).length > 0 ? { env: { ...process.env, ...extraEnv } } : {}),
        });
        child.on('error', () => resolve(1));
        child.on('exit', (code) => resolve(typeof code === 'number' ? code : 1));
    });
}

async function askWhereTheRelayLives(): Promise<SetupRelaySelection> {
    // Wording reused from the client's own pre-auth screen so the terminal and
    // the app ask the same question the same way.
    const choice = await promptMultipleChoice(
        [
            '',
            '你的中继服务部署在哪里？',
            '',
            '你的中继服务负责在手机与电脑之间转发消息。',
            '选择其部署位置 —— 稍后你可以随时更改。',
            '',
            '  c) Kaiwu Cloud            托管中继 — 最便捷的起步选择',
            '  r) 我已在运行的中继',
            '  t) 在此电脑上',
            '',
            '选择',
        ].join('\n'),
        [
            { id: 'cloud', keys: ['c', 'cloud', ''], short: 'C' },
            { id: 'existing', keys: ['r', 'relay'], short: 'r' },
            { id: 'thisComputer', keys: ['t', 'this'], short: 't' },
        ] as const,
        { defaultId: 'cloud', maxAttempts: 3 },
    );

    if (choice === 'cloud') return { kind: 'cloud' };
    if (choice === 'thisComputer') return { kind: 'thisComputer' };

    const url = (await promptInput('中继 URL: ')).trim();
    if (!url) throw new Error('必须提供中继 URL 才能继续。获取到 URL 后请重新运行 `kaiwu setup`。');
    return { kind: 'existing', url };
}

/**
 * `server add` asks for a relay profile name whenever it can, and refuses to run
 * without `--name` the moment it cannot. Either way an unattended run has to
 * supply one, so it supplies the same default `server add` would have offered.
 */
function serverAddArgs(relayUrl: string): readonly string[] {
    return ['server', 'add', '--server-url', relayUrl, '--name', defaultNameFromUrl(relayUrl), '--use'];
}

async function runStep(step: SetupStep, unattended: boolean): Promise<boolean> {
    switch (step.kind) {
        case 'alreadyConfigured':
            if (!await reconcileDefaultFollowingBackgroundServicesAfterAuthentication({ restartExisting: false })) {
                return false;
            }
            console.log(`此电脑已完成配置（中继: ${step.relayUrl}）。`);
            console.log('运行 `kaiwu status` 检查各项状态，或运行 `kaiwu` 启动会话。');
            return true;
        case 'explainRelayReachability':
            printRelayReachabilityIntro(step.reachability);
            return true;
        case 'installLocalRelay':
            return (await runCliStep(['relay', 'host', 'install'], {
                unattended,
                deferServerSelectionFollowUp: true,
            })) === 0;
        case 'reportRelayReachability':
            await printRelayReachabilityNextSteps(step.reachability);
            return true;
        case 'offerTailscaleSetup':
            await offerTailscaleSetup();
            return true;
        case 'selectRelay': {
            return (await runCliStep(serverAddArgs(step.relayUrl), {
                unattended,
                deferServerSelectionFollowUp: true,
            })) === 0;
        }
        case 'selectCloudRelay':
            return (await runCliStep(['server', 'use', 'cloud'], {
                unattended,
                deferServerSelectionFollowUp: true,
            })) === 0;
        case 'authLogin':
            return (await runCliStep(resolveAuthLoginArgv(), { unattended })) === 0;
        case 'warnNoAgent':
            console.log('');
            console.log('此电脑上未发现编程 Agent。');
            console.log('');
            console.log("Kaiwu 负责驱动你的编程 Agent，本身不附带 Agent。请至少安装");
            console.log('一个 Agent，然后再次运行 `kaiwu`：');
            console.log('');
            console.log('  Claude Code   curl -fsSL https://claude.ai/install.sh | bash');
            console.log('  Codex         kaiwu install provider codex');
            console.log('  OpenCode      kaiwu install provider opencode');
            console.log('');
            console.log('  查看全部支持的 Agent: kaiwu install provider --help');
            return true;
        default:
            return true;
    }
}

export async function handleSetupCliCommand(context: CommandContext): Promise<void> {
    const parsed = parseSetupArgs(context.args.slice(1));

    if (parsed.kind === 'help') {
        console.log(HELP);
        return;
    }

    if (parsed.kind === 'invalid') {
        // Silently ignoring an unknown or contradictory flag is how a misspelled
        // `--this-computer` became a Cloud account nobody asked for.
        console.error(parsed.message);
        console.error('运行 `kaiwu setup --help` 查看可用选项。');
        process.exitCode = 1;
        return;
    }

    // `--yes` is an explicit instruction to go ahead, so it outranks both the
    // ambient HAPPIER_NONINTERACTIVE=1 and a missing terminal — which is the
    // whole point of running setup from a script. `isInteractiveTerminal()` is
    // the CLI's one reader of that environment variable; setup does not keep a
    // second copy of the rule.
    const autonomy: SetupAutonomy = parsed.assumeYes
        ? 'unattended'
        : parsed.forcedNonInteractive || !isInteractiveTerminal()
            ? 'createNothing'
            : 'interactive';
    const unattended = autonomy === 'unattended';

    const [auth, activeProfile, installedAgentIds] = await Promise.all([
        // Readiness is the auth owner's to decide. Stored credential bytes say
        // nothing about whether the relay still accepts them or whether this
        // machine was ever registered — the two states setup exists to repair.
        resolveActiveServerAuthReadiness(),
        getActiveServerProfile().catch(() => null),
        listInstalledAgentIds(),
    ]);

    let relaySelection = parsed.relaySelection;

    // Probed only for a relay we are about to host here, and only once: nothing
    // else in this flow depends on Tailscale.
    let tailscaleProbe: Promise<TailscaleStatusSnapshot | null> | null = null;
    const tailscaleFor = async (selection: SetupRelaySelection | null): Promise<TailscaleStatusSnapshot | null> => {
        if (selection?.kind !== 'thisComputer') return null;
        tailscaleProbe ??= readTailscaleStatusSnapshot();
        return await tailscaleProbe;
    };

    const planFor = async (selection: SetupRelaySelection | null) => buildSetupPlan({
        autonomy,
        auth: {
            authenticated: auth.authenticated,
            credentialState: auth.credentialState,
            machineRegistered: auth.machineRegistered,
        },
        activeRelayUrl: activeProfile?.serverUrl ?? null,
        relaySelection: selection,
        installedAgentIds,
        tailscale: await tailscaleFor(selection),
    });

    let plan = await planFor(relaySelection);

    // The one question setup owns. A plan that stops has already said why, so
    // asking here would be asking someone who is not there.
    if (!relaySelection && !plan.stop && plan.steps.length === 0) {
        relaySelection = await askWhereTheRelayLives();
        plan = await planFor(relaySelection);
    }

    for (const step of plan.steps) {
        const ok = await runStep(step, unattended);
        if (!ok) {
            console.log('');
            console.log('Setup 已停止。未丢失任何内容 —— 再次运行 `kaiwu setup` 即可从上次中断处继续，');
            console.log('或运行 `kaiwu status` 查看当前配置。');
            // Exit non-zero so the installer reports setup as incomplete rather
            // than printing "you're ready". Installing the binary still
            // succeeded; finishing the guided setup did not.
            process.exitCode = 1;
            return;
        }
    }

    if (plan.stop) {
        if (plan.steps.length > 0) console.log('');
        console.log(plan.stop.detail);
        // Setup is unfinished either way — nothing was created, or the sign-in
        // that finishes it still has to be approved by a person. The installer
        // reads a zero exit as "you're ready".
        process.exitCode = 1;
    }
}
