import chalk from 'chalk';

export function showAuthHelp(): void {
  console.log(`
${chalk.bold('kaiwu auth')} - 身份认证管理

${chalk.bold('用法:')}
  kaiwu auth login [--no-open] [--force] [--method web|mobile] [--wait-timeout <seconds>] [--server <name-or-id> | --server-url <url> [--webapp-url <url>] [--persist|--no-persist]]    登录并认证 Kaiwu 账号
  kaiwu auth request --json [--server <name-or-id> | --server-url <url> [--webapp-url <url>] [--persist|--no-persist]]                                    创建基于认领机制的认证请求（适用于无头环境）
  kaiwu auth approve --public-key <base64> --json [--server <name-or-id> | --server-url <url> [--webapp-url <url>] [--persist|--no-persist]]              使用本地凭据批准认证请求
  kaiwu auth wait --public-key <base64> --json [--server <name-or-id> | --server-url <url> [--webapp-url <url>] [--persist|--no-persist]]                等待批准并写入此机器的凭据
  kaiwu auth pair-remote --ssh <user@host> [--json] [--no-post-check] [--server-url-for-remote <url> [--remote-webapp-url <url>]]                              通过 SSH 进行全自动远程配对
  kaiwu auth logout [--all]     退出登录（默认退出当前活跃中继）
  kaiwu auth status             显示身份认证状态
  kaiwu auth help               显示此帮助信息

${chalk.bold('选项:')}
  --no-open  不尝试打开浏览器（仅打印 URL）
  --force    重新认证前清除凭据与机器 ID 并停止守护进程
  --method   强制指定认证方式（web|mobile），适用于无头/非 TTY 环境
  --wait-timeout  在 N 秒后停止等待批准并打印如何完成（默认：无限期等待）
  --print-configure-links  为工具打印高级“配置中继”链接（较少使用）
  --all      与 logout 连用时，移除所有中继的本地数据
  --json       输出机器可读的 JSON（推荐容器环境使用）
  --public-key 与 approve/wait 配合使用；来自 "auth request --json" 的终端公钥
  --ssh        与 pair-remote 配合使用；SSH 目标（例如 user@host）
  --no-post-check  跳过远程主机配对后的 'doctor repair' 检查（默认运行）
  --remote-command       在远程主机上运行的 Kaiwu 命令（默认：kaiwu）
  --server-url-for-remote  远程主机访问此电脑中继所用的地址
  --remote-server-url    --server-url-for-remote 的旧版别名
  --remote-local-server-url  与 --remote-server-url 配对的远程本地 API URL
  --remote-webapp-url    在远程主机上持久化的 Web 应用 URL
  --server      使用已保存的中继配置文件
  --server-url  使用指定的中继 URL（除非使用 --persist，否则不持久化）
  --webapp-url  覆盖此中继配置文件的 Web 应用 URL
  --persist     将 --server-url 持久化为当前活跃的中继配置文件
  --no-persist  仅在本次调用中使用 --server-url（默认）

${chalk.gray('附注：主密钥绝不会离开你的移动设备或网页端。每台 CLI 机器')}
${chalk.gray('仅接收用于单机加密的派生密钥，因此无法在 CLI 中显示备用恢复码。')}
`);
}
