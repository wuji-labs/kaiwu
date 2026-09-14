import chalk from 'chalk';

import { readFlagValue } from '@/cli/commands/shared/argvFlags';
import { printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { readMcpServersSettingsFromAccountSettings } from '@/mcp/servers/readMcpServersSettingsFromAccountSettings';

import { McpServersSettingsV1Schema } from '@happier-dev/protocol';

import type { McpCommandDeps } from '../deps';
import { readRepeatedFlagValues } from '../argv';

export async function cmdMcpServersAdd(
  argv: string[],
  deps: McpCommandDeps,
  opts: Readonly<{ json: boolean }>,
): Promise<void> {
  const credentials = await deps.readCredentials();
  if (!credentials) {
    if (opts.json) {
      await printJsonEnvelope({ ok: false, kind: 'mcp_servers_add', error: { code: 'not_authenticated' } }, { exitCode: 1 });
      return;
    }
    console.error(chalk.red('错误：'), '尚未登录。请先运行 "kaiwu auth login"。');
    process.exitCode = 1;
    return;
  }

  const name = readFlagValue(argv, '--name');
  const transport = (readFlagValue(argv, '--transport') ?? 'stdio').toLowerCase();
  const command = readFlagValue(argv, '--command');
  const args = readRepeatedFlagValues(argv, '--arg');

  if (!name) throw new Error('用法：kaiwu mcp servers add --name <name> --transport stdio --command <cmd> [--arg <arg>] [--json]');
  if (transport !== 'stdio') throw new Error('当前命令仅支持 stdio 传输方式。');
  if (!command) throw new Error('缺少 --command');

  const id = deps.randomUUID();
  const now = deps.nowMs();

  await deps.updateAccountSettingsV2WithRetry({
    credentials,
    mutate: (settings: Readonly<Record<string, unknown>>) => {
      const current = readMcpServersSettingsFromAccountSettings(settings);
      if (current.servers.some((s) => s.name === name)) {
        throw new Error(`MCP 服务器名称已存在：${name}`);
      }
      const next = McpServersSettingsV1Schema.parse({
        ...current,
        servers: [
          ...current.servers,
          {
            id,
            name,
            transport: 'stdio',
            stdio: { command, args },
            env: {},
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      return { ...settings, mcpServersSettingsV1: next };
    },
  });

  if (opts.json) {
    await printJsonEnvelope({ ok: true, kind: 'mcp_servers_add', data: { created: { id, name } } });
    return;
  }

  console.log(chalk.green('✓'), `MCP 服务器已添加：${name}`);
}
