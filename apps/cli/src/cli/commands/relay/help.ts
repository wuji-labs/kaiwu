export function showRelayHelp(): void {
  // Keep help output concise; detailed relay profile management remains under `kaiwu server ...` for now.
  console.log('kaiwu relay inspect-target [--json]');
  console.log('kaiwu relay use <relay-url | --local [--local-channel stable|preview|dev]> [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay add <relay-url | --local [--local-channel stable|preview|dev]> [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay set <relay-url | --local [--local-channel stable|preview|dev]> [--use] [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay host <install|status|start|stop|restart|uninstall> [--ssh <user@host>] [--mode user|system] [--channel stable|preview|dev] [--env KEY=VALUE]... [--server-binary <path>] [--lan | --expose | --host <ip>] [--yes] [--json]');
  console.log('  --lan           绑定到局域网/Tailscale IP（自动检测；检测到多个网卡时会提示选择）');
  console.log('  --expose        绑定到所有网卡（0.0.0.0）');
  console.log('  --host <ip>     绑定到指定 IP 地址');
  console.log('kaiwu relay start-daemon [--local-channel stable|preview|dev]   # 激活本地中继配置并启动守护进程');
  console.log('kaiwu relay auth [--local-channel stable|preview|dev] [auth flags]  # 激活本地中继配置并对其执行 `auth login`');
  console.log('');
  console.log('--local 选择与当前 CLI 通道匹配的本地中继；若不存在，命令会报错并列出其他通道。');
  console.log('--local-channel 强制指定通道。');
  console.log('');
  console.log('本地 `relay host install` 会询问其他设备访问中继所用的地址，并将其保存到中继配置中。');
  console.log('无终端或使用 --yes 时，会保留已经可访问的绑定地址；否则选择第一个可访问地址并打印选择结果。');
}
