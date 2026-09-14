import chalk from 'chalk';
import { readCredentials } from '@/persistence';
import { ApiClient } from '@/api/api';
import type { CloudConnectTarget, CloudConnectTargetStatus } from '@/cloud/connectTypes';
import { AGENTS } from '@/backends/catalog';
import { promptInput } from '@/terminal/prompts/promptInput';
import { buildConnectedServiceCredentialRecord, type ConnectedServiceId } from '@happier-dev/protocol';

import type { CommandContext } from '@/cli/commandRegistry';
import { buildConnectedAccountOauthCredentialRecord } from '@/daemon/connectedServices/descriptors/buildConnectedAccountCredentialRecord';
import { githubConnectedAccountTarget } from '@/daemon/connectedServices/github/githubConnectedAccountTarget';
import { parseConnectArgs, type ConnectParsedOptions } from './connect/parseConnectArgs';
import { resolveConnectAuthIntent } from './connect/resolveConnectAuthIntent';
import { resolveConnectTargetServiceIds } from './connect/resolveConnectTargetServiceIds';
import { storeConnectedServiceCredentialForAccount } from '@/cloud/connectedServices/storeConnectedServiceCredentialForAccount';

/**
 * Handle connect subcommand.
 *
 * Implements connect subcommands for storing Connected Services credentials (v2):
 * - connect codex: Store OpenAI Codex subscription OAuth (openai-codex) or OpenAI API key (openai)
 * - connect claude: Store Claude subscription auth (claude-subscription) or Anthropic API key (anthropic)
 * - connect gemini: Store Gemini OAuth (gemini)
 */
export async function handleConnectCommand(args: string[]): Promise<void> {
    const { includeExperimental, subcommand, options } = parseConnectArgs(args);

    const allTargets = await loadConnectTargets({ includeExperimental: true });
    const visibleTargets = includeExperimental ? allTargets : allTargets.filter((t) => t.status === 'wired');

    const targetById = new Map<string, CloudConnectTarget>(allTargets.map((t) => [t.id, t] as const));
    const visibleTargetById = new Map<string, CloudConnectTarget>(visibleTargets.map((t) => [t.id, t] as const));

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showConnectHelp(visibleTargets, { includeExperimental });
        return;
    }

    const normalized = subcommand.toLowerCase();
    if (normalized === 'status') {
      await handleConnectStatus(visibleTargets);
      return;
    }

    const visibleTarget = visibleTargetById.get(normalized);
    if (!visibleTarget) {
      const hiddenTarget = targetById.get(normalized);
      if (hiddenTarget && hiddenTarget.status === 'experimental' && !includeExperimental) {
        console.error(chalk.yellow(`连接目标“${hiddenTarget.id}”属于实验功能，默认未启用。`));
        console.error(chalk.gray(`请运行：kaiwu connect --all ${hiddenTarget.id}`));
        process.exit(1);
      }
      console.error(chalk.red(`未知的连接目标：${subcommand}`));
      showConnectHelp(visibleTargets, { includeExperimental });
      process.exit(1);
    }

    await handleConnectVendor(visibleTarget, options);
}

async function loadConnectTargets(params: Readonly<{ includeExperimental: boolean }>): Promise<CloudConnectTarget[]> {
  const targets: CloudConnectTarget[] = [githubConnectedAccountTarget];
  for (const entry of Object.values(AGENTS)) {
    if (!entry.getCloudConnectTarget) continue;
    targets.push(await entry.getCloudConnectTarget());
  }
  targets.sort((a, b) => a.id.localeCompare(b.id));
  return params.includeExperimental ? targets : targets.filter((t) => t.status === 'wired');
}

function showConnectHelp(targets: ReadonlyArray<CloudConnectTarget>, opts: Readonly<{ includeExperimental: boolean }>): void {
    const targetLines = targets.length > 0
      ? targets.map((t) => formatTargetLine(t)).join('\n')
      : '  （未注册连接目标）';
    console.log(`
${chalk.bold('kaiwu connect')} - 将 AI 厂商订阅和 API 密钥连接到开物云

${chalk.bold('Usage:')}
${targetLines}
  kaiwu connect status       查看所有厂商的连接状态
  kaiwu connect help         显示此帮助信息
  kaiwu connect --all ...    包含实验性提供方
  kaiwu connect <target> --profile <id>      保存到指定配置（默认：default）
  kaiwu connect <target> --paste             无头模式：粘贴重定向 URL
  kaiwu connect <target> --device            使用设备码认证（Codex）
  kaiwu connect codex --api-key              保存 OpenAI API 密钥
  kaiwu connect claude --api-key             保存 Anthropic API 密钥（不是 Claude 订阅）
  kaiwu connect claude --setup-token         保存 Claude setup-token（claude 默认方式）
  kaiwu connect claude --oauth               保存 Claude 订阅 OAuth（高级方式）
  kaiwu connect github --token               保存 GitHub 访问令牌
  kaiwu connect <target> --no-open           不尝试打开浏览器
  kaiwu connect <target> --timeout <seconds> 覆盖 OAuth 超时时间

${chalk.bold('说明:')}
  connect 命令可将已连接服务的凭据安全保存到开物云端。
  这样即可通过开物使用这些服务，而无需在本机暴露凭据。

${chalk.bold('示例:')}
  kaiwu connect ${targets[0]?.id ?? 'gemini'}
  kaiwu connect status

${chalk.bold('说明:')} 
  • 请先完成开物认证（运行 'kaiwu auth login'）
  • 凭据会加密并安全存储在开物云端
  • 可在 kaiwu.chengqiyun.com 管理已保存的密钥
  ${opts.includeExperimental ? '' : '• 部分提供方属于实验功能；使用 --all 查看'}
`);
}

function formatTargetLine(target: CloudConnectTarget): string {
  const statusSuffix = target.status === 'wired' ? '' : chalk.gray(' (experimental)');
  return `  kaiwu connect ${target.id.padEnd(12)} ${target.vendorDisplayName}${statusSuffix}`;
}

async function handleConnectVendor(target: CloudConnectTarget, options: ConnectParsedOptions): Promise<void> {
    console.log(chalk.bold(`\n🔌 正在将 ${target.vendorDisplayName} 连接到开物云\n`));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  尚未完成开物认证'));
        console.log(chalk.gray('  请先运行 "kaiwu auth login"'));
        process.exit(1);
    }

    // Create API client
    const api = await ApiClient.create(credentials);

    const now = Date.now();
    let postConnectPayload: unknown | null = null;

    const record = await (async () => {
      const authIntent = resolveConnectAuthIntent({ targetId: target.id, options });
      const serviceId: ConnectedServiceId = authIntent.serviceId;
      if (authIntent.kind === 'token') {
        const promptLabel =
          authIntent.tokenKind === 'setup-token'
            ? '粘贴 Claude setup-token（运行 `claude setup-token` 获取）：'
            : authIntent.tokenKind === 'access-token'
              ? '粘贴 GitHub 访问令牌：'
              : serviceId === 'openai'
                ? '粘贴 OpenAI API 密钥：'
                : '粘贴 Anthropic API 密钥：';
        const token = (await promptInput(promptLabel)).trim();
        if (!token) {
          throw new Error(
            authIntent.tokenKind === 'setup-token'
              ? '缺少 setup-token'
              : authIntent.tokenKind === 'access-token'
                ? '缺少访问令牌'
                : '缺少 API 密钥',
          );
        }
        return buildConnectedServiceCredentialRecord({
          now,
          serviceId,
          profileId: options.profileId,
          kind: 'token',
          token: { token, providerAccountId: null, providerEmail: null },
        });
      }

      const oauth = await target.authenticate({
        paste: options.paste,
        device: options.device,
        noOpen: options.noOpen,
        timeoutSeconds: options.timeoutSeconds ?? undefined,
      });
      postConnectPayload = oauth;

      return buildConnectedAccountOauthCredentialRecord({
        now,
        serviceId,
        profileId: options.profileId,
        payload: oauth,
      });
    })();

    console.log(`🚀 正在向中继注册 ${target.displayName} 凭据（${record.serviceId}/${options.profileId}）`);
    await storeConnectedServiceCredentialForAccount({
      api,
      credentials,
      record,
    });

    console.log(`✅ ${target.displayName} 凭据已注册到中继`);
    if (postConnectPayload !== null) {
      target.postConnect?.(postConnectPayload);
    }
    process.exit(0);
}

/**
 * Show connection status for all vendors
 */
async function handleConnectStatus(targets: ReadonlyArray<CloudConnectTarget>): Promise<void> {
    console.log(chalk.bold('\n🔌 连接状态\n'));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  尚未完成开物认证'));
        console.log(chalk.gray('  请先运行 "kaiwu auth login"'));
        process.exit(1);
    }

    // Create API client
    const api = await ApiClient.create(credentials);

    for (const target of targets) {
      try {
        const serviceIds: ConnectedServiceId[] = resolveConnectTargetServiceIds(target.id);

        if (serviceIds.length === 0) {
          console.log(`  ${chalk.gray('○')}  ${target.vendorDisplayName}: ${chalk.gray('不支持')}`);
          continue;
        }

        const allProfiles = (await Promise.all(serviceIds.map(async (serviceId) => {
          const { profiles } = await api.listConnectedServiceProfiles({ serviceId });
          return profiles;
        }))).flat();

        const connected = allProfiles.filter((p) => p.status === 'connected');
        if (connected.length === 0) {
          const needsReauth = allProfiles.length > 0;
          const label = needsReauth ? '需要重新认证' : '未连接';
          const icon = needsReauth ? chalk.yellow('⚠️') : chalk.gray('○');
          const color = needsReauth ? chalk.yellow(label) : chalk.gray(label);
          console.log(`  ${icon}  ${target.vendorDisplayName}: ${color}`);
          continue;
        }

        const primary = connected[0]!;
        const userInfo = primary.providerEmail ? chalk.gray(` (${primary.providerEmail})`) : '';
        console.log(`  ${chalk.green('✓')}  ${target.vendorDisplayName}: ${chalk.green('已连接')}${userInfo}`);
      } catch (error) {
        if (process.env.DEBUG) {
          console.error(chalk.gray(`[debug] 检查 ${target.vendorDisplayName} 连接失败：`), error);
        }
        console.log(`  ${chalk.yellow('?')}  ${target.vendorDisplayName}: ${chalk.yellow('未知（检查失败）')}`);
      }
    }

    console.log('');
    console.log(chalk.gray('连接厂商请运行：kaiwu connect <vendor>'));
    console.log(chalk.gray('示例：kaiwu connect gemini'));
    console.log('');
}

export async function handleConnectCliCommand(context: CommandContext): Promise<void> {
  try {
    await handleConnectCommand(context.args.slice(1));
  } catch (error) {
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
