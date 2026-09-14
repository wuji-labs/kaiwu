import chalk from 'chalk';

import { configuration } from '@/configuration';

export function showServerHelp(): void {
  console.log(`
${chalk.bold('kaiwu server')} - 管理中继配置

${chalk.bold('用法:')}
  kaiwu server list
  kaiwu server current
  kaiwu server add [--name <name>] [--server-url <url>] [--public-server-url <url>] [--webapp-url <url>] [--use] [--no-use] [--yes] [--start-daemon] [--install-service]
  kaiwu server use <name-or-id>
  kaiwu server remove <name-or-id> [--force]
  kaiwu server test [<name-or-id>]
  kaiwu server set [--server-id <id>] --server-url <url> [--public-server-url <url>] [--webapp-url <url>]

${chalk.bold('说明:')}
  • 配置保存在 ${configuration.settingsFile}
  • 凭据按中继配置分别保存在 ${configuration.serversDir}
  • 公网中继地址用于二维码/深链接（默认使用中继地址）
  • add 保存前会检查中继是否响应 /v1/version；使用 --yes 可跳过检查直接保存
  • 仅本次运行覆盖环境变量：HAPPIER_SERVER_URL / HAPPIER_PUBLIC_SERVER_URL / HAPPIER_WEBAPP_URL
`);
}
