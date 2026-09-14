import chalk from 'chalk';

import { listRootHelpCommands } from './commandSurfaceManifest';

const HELP_LABEL_WIDTH = 27;

function formatHelpEntry(label: string, description: string): string {
  return `  ${label.padEnd(HELP_LABEL_WIDTH)} ${description}`;
}

export function buildRootHelpText(): string {
  const helpEntries = listRootHelpCommands();
  return `
${chalk.bold('kaiwu')} - 随时随地的 AI 命令行

${chalk.bold('用法:')}
${helpEntries.map((entry) => {
    const label = entry.rootHelpLabel ?? '';
    const description = entry.rootHelpDescription ?? '';
    const firstLine = formatHelpEntry(label, description);
    if (!entry.rootHelpDetail) return firstLine;
    return `${firstLine}\n${formatHelpEntry('', entry.rootHelpDetail)}`;
  }).join('\n')}

${chalk.bold('示例:')}
  kaiwu                    启动会话
  kaiwu --refresh-settings  启动前强制刷新账号设置
  kaiwu --launch-profile <id-or-name> 使用设置中的启动配置文件启动
  kaiwu --auth cs:<id>    使用指定的已连接服务配置文件或账号池启动
  kaiwu --auth native     使用原生提供商身份认证启动
  kaiwu --yolo             跳过权限确认启动
                              --dangerously-skip-permissions 的 kaiwu 简写
  kaiwu --chrome           为此会话启用 Chrome 浏览器访问权限
  kaiwu --no-chrome        禁用 Chrome（即使默认开启）
  kaiwu --js-runtime bun   使用 bun 代替 node 启动 JavaScript 编写的 CLI
  kaiwu auth login --force 执行身份认证
  kaiwu profiles list      列出可用的后端配置文件
  kaiwu doctor             运行诊断

${chalk.bold('服务器选择（全局标志；仅限前缀；不持久化）:')}
  kaiwu --server <name-or-id> ...
  kaiwu --server-url <url> [--webapp-url <url>] [--public-server-url <url>] ...
`;
}
