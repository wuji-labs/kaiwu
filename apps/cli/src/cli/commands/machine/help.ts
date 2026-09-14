import chalk from 'chalk';

export function showMachineHelp(): void {
  console.log(`
${chalk.bold('kaiwu machine')} - 初始化并管理远程机器

${chalk.bold('用法:')}
  kaiwu machine setup --ssh <user@host> [--identity-file <path>] [--ssh-config-file <path>] [--known-hosts-path <path>] [--trusted-host-key <line>]
  kaiwu machine setup --ssh <user@host> [--server <name-or-id> | --server-url <url> [--webapp-url <url>] [--public-server-url <url>]]
  kaiwu machine setup --ssh <user@host> [--service-mode <user|none>] [--install-relay-runtime] [--relay-runtime-mode <user|system>] [--yes] [--json]

${chalk.bold('说明:')}
  • 这是标准远程 SSH 机器初始化任务的轻量包装。
  • 使用 --json 输出协议事件和结果 JSON 行。
  • 在交互式终端中，SSH 主机信任与配对确认会直接显示。
  • 在非交互运行中使用 --yes 自动接受设置提示。
  `);
}
