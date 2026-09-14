import chalk from 'chalk';

export function showProfilesHelp(): void {
  console.log(`
${chalk.bold('kaiwu profiles')} - 智能体后端配置

${chalk.bold('用法:')}
  kaiwu profiles list [--refresh-settings] [--json]

${chalk.bold('别名:')}
  kaiwu profile list

${chalk.bold('说明:')}
  - 启动会话时使用 --profile <id-or-name> 应用配置。
  - 运行 "kaiwu auth login" 后可查看账户设置中保存的自定义配置。
`);
}
