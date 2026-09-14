import chalk from 'chalk';

import { readFlagValue } from '@/cli/commands/shared/argvFlags';
import { printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { readMcpServersSettingsFromAccountSettings } from '@/mcp/servers/readMcpServersSettingsFromAccountSettings';
import { resolveEffectiveMcpServersForDirectory } from '@/mcp/servers/resolveEffectiveMcpServersForDirectory';
import { materializeMcpServerConfigRecord } from '@/mcp/servers/materializeMcpServerConfigRecord';
import {
  deriveSettingsSecretsKeyForCredentials,
  deriveSettingsSecretsReadKeysForCredentials,
  indexSavedSecretsByIdFromAccountSettings,
} from '@/mcp/servers/resolveMcpValueRefPlaintext';
import { redactMcpServerProbeError } from '@/mcp/servers/redactMcpServerProbeError';
import { loadFreshMcpAccountSettingsContext } from '../loadFreshMcpAccountSettingsContext';

import type { McpCommandDeps } from '../deps';

export async function cmdMcpServersTest(
  argv: string[],
  deps: McpCommandDeps,
  opts: Readonly<{ json: boolean }>,
): Promise<void> {
  const credentials = await deps.readCredentials();
  if (!credentials) {
    if (opts.json) {
      await printJsonEnvelope({ ok: false, kind: 'mcp_servers_test', error: { code: 'not_authenticated' } }, { exitCode: 1 });
      return;
    }
    console.error(chalk.red('错误：'), '尚未登录。请先运行 "kaiwu auth login"。');
    process.exitCode = 1;
    return;
  }

  const serverRef = readFlagValue(argv, '--mcp-server') ?? readFlagValue(argv, '--server');
  const directory = readFlagValue(argv, '--dir') ?? process.cwd();
  if (!serverRef) throw new Error('用法：kaiwu mcp servers test --mcp-server <name|id> [--dir <path>] [--json]');

  const startedAt = deps.nowMs();

  try {
    const { machineId } = await deps.ensureMachineIdForCredentials(credentials);
    const ctx = await loadFreshMcpAccountSettingsContext(credentials, deps);
    const mcpSettings = readMcpServersSettingsFromAccountSettings(ctx.settings);

    const server = mcpSettings.servers.find((s) => s.id === serverRef || s.name === serverRef) ?? null;
    if (!server) throw new Error(`未找到 MCP 服务器：${serverRef}`);

    const resolved = resolveEffectiveMcpServersForDirectory({
      settings: mcpSettings,
      machineId,
      directory,
    });
    const item = resolved.serversByName[server.name];
    if (!item) throw new Error(`此目标未启用 MCP 服务器：${server.name}`);
    if (item.enabled !== true) throw new Error(`此目标已禁用 MCP 服务器：${server.name}`);

    const savedSecretsById = indexSavedSecretsByIdFromAccountSettings(ctx.settings);
    const settingsSecretsKey = deriveSettingsSecretsKeyForCredentials(credentials);
    const settingsSecretsReadKeys = deriveSettingsSecretsReadKeysForCredentials(credentials);

    const materialized = await materializeMcpServerConfigRecord({
      resolved: { directory, strictMode: true, serversByName: { [server.name]: item } },
      savedSecretsById,
      settingsSecretsKey,
      settingsSecretsReadKeys,
      processEnv: process.env,
      tmpDir: null,
      strictMode: true,
    });

    const config = materialized.mcpServers[server.name];
    if (!config) throw new Error('materialize_missing_config');

    const tools = await deps.probeMcpStdioServerTools({ config, baseEnv: process.env });
    const toolNames = tools.map((t) => t.name);
    const durationMs = Math.max(0, deps.nowMs() - startedAt);

    if (opts.json) {
      await printJsonEnvelope({
        ok: true,
        kind: 'mcp_servers_test',
        data: {
          toolCount: toolNames.length,
          toolNamesSample: toolNames.slice(0, 20),
          durationMs,
        },
      });
      return;
    }

    console.log(chalk.green('✓'), `${toolNames.length} 个工具`);
    for (const name of toolNames.slice(0, 20)) console.log(`- ${name}`);
  } catch (error) {
    const message = redactMcpServerProbeError(error);
    if (opts.json) {
      await printJsonEnvelope({
        ok: false,
        kind: 'mcp_servers_test',
        error: {
          code: 'mcp_test_failed',
          message,
        },
      }, { exitCode: 1 });
      return;
    }
    console.error(chalk.red('错误：'), message);
    process.exitCode = 1;
  }
}
