import chalk from 'chalk';

import { hasFlag, readFlagValue } from '@/cli/commands/shared/argvFlags';
import { printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { readMcpServersSettingsFromAccountSettings } from '@/mcp/servers/readMcpServersSettingsFromAccountSettings';

import { McpServersSettingsV1Schema } from '@happier-dev/protocol';

import type { McpCommandDeps } from '../deps';

export async function cmdMcpServersBind(
  argv: string[],
  deps: McpCommandDeps,
  opts: Readonly<{ json: boolean }>,
): Promise<void> {
  const credentials = await deps.readCredentials();
  if (!credentials) {
    if (opts.json) {
      await printJsonEnvelope({ ok: false, kind: 'mcp_servers_bind', error: { code: 'not_authenticated' } }, { exitCode: 1 });
      return;
    }
    console.error(chalk.red('错误：'), '尚未登录。请先运行 "kaiwu auth login"。');
    process.exitCode = 1;
    return;
  }

  const serverRef = readFlagValue(argv, '--mcp-server') ?? readFlagValue(argv, '--server');
  const allMachines = hasFlag(argv, '--all-machines');
  if (!serverRef) {
    throw new Error('用法：kaiwu mcp servers bind --mcp-server <name|id> --all-machines [--json]');
  }
  if (!allMachines) throw new Error('缺少绑定目标（请尝试 --all-machines）。');

  const bindingId = deps.randomUUID();
  const now = deps.nowMs();

  await deps.updateAccountSettingsV2WithRetry({
    credentials,
    mutate: (settings: Readonly<Record<string, unknown>>) => {
      const current = readMcpServersSettingsFromAccountSettings(settings);
      const server = current.servers.find((s) => s.id === serverRef || s.name === serverRef) ?? null;
      if (!server) throw new Error(`未找到 MCP 服务器：${serverRef}`);
      const next = McpServersSettingsV1Schema.parse({
        ...current,
        bindings: [
          ...current.bindings,
          {
            id: bindingId,
            serverId: server.id,
            enabled: true,
            target: { t: 'allMachines' },
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      return { ...settings, mcpServersSettingsV1: next };
    },
  });

  if (opts.json) {
    await printJsonEnvelope({ ok: true, kind: 'mcp_servers_bind', data: { createdBindingId: bindingId } });
    return;
  }

  console.log(chalk.green('✓'), `MCP 绑定已创建：${bindingId}`);
}
