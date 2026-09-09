export function showRelayHelp(): void {
  // Keep help output concise; detailed relay profile management remains under `kaiwu server ...` for now.
  console.log('kaiwu relay inspect-target [--json]');
  console.log('kaiwu relay use <relay-url | --local [--local-channel stable|preview|dev]> [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay add <relay-url | --local [--local-channel stable|preview|dev]> [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay set <relay-url | --local [--local-channel stable|preview|dev]> [--use] [--json] [--server-url <url>] [--webapp-url <url>] [--local-server-url <url>] [--name <name>]');
  console.log('kaiwu relay host <install|status|start|stop|restart|uninstall> [--ssh <user@host>] [--mode user|system] [--channel stable|preview|dev] [--env KEY=VALUE]... [--server-binary <path>] [--lan | --expose | --host <ip>] [--yes] [--json]');
  console.log('  --lan           Bind to a LAN/Tailscale IP (auto-detected; prompts if multiple interfaces found)');
  console.log('  --expose        Bind to all interfaces (0.0.0.0)');
  console.log('  --host <ip>     Bind to a specific IP address');
  console.log('kaiwu relay start-daemon [--local-channel stable|preview|dev]   # activate local relay profile + start the daemon');
  console.log('kaiwu relay auth [--local-channel stable|preview|dev] [auth flags]  # activate local relay profile + `auth login` against it');
  console.log('');
  console.log('--local picks the local relay matching the current CLI channel; if none exists, the command errors and lists other channels.');
  console.log('--local-channel forces an explicit channel.');
  console.log('');
  console.log('A local `relay host install` asks which address other devices should reach the relay at, and stores it in the');
  console.log('relay profile. Without a terminal, or with --yes, it keeps an already-reachable bind address, otherwise takes the');
  console.log('first reachable one, and prints what it chose.');
}
