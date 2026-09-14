import { describe, expect, it, vi } from 'vitest';

import { isTmuxAllowedCommand, listRootHelpCommands } from './commandSurfaceManifest';
import { buildRootHelpText } from './buildRootHelpText';
import { showAuthHelp } from './commands/auth/help';

describe('CLI command-surface manifest', () => {
  it('exposes the current root help command list from one manifest', () => {
    const entries = listRootHelpCommands();
    expect(entries.map((entry) => entry.command)).toEqual([
      null,
      'setup',
      'auth',
      'automation',
      'mcp',
      'codex',
      'opencode',
      'gemini',
      'connect',
      'notify',
      'install',
      'status',
      'service',
      'daemon',
      'doctor',
      'session',
      'resume',
    ]);

    for (const entry of entries) {
      expect(entry.rootHelpLabel).toBeTypeOf('string');
      expect(entry.rootHelpLabel).toMatch(/^kaiwu\b/u);
    }

    const defaultCmd = entries.find((e) => e.command === null);
    expect(defaultCmd?.rootHelpDescription).toBe('启动默认后端并启用移动端控制');

    const setup = entries.find((e) => e.command === 'setup');
    expect(setup?.rootHelpDescription).toBe('连接此电脑到你的 Kaiwu 账号');
    expect(setup?.rootHelpDetail).toBe('选择中继服务所在位置，然后登录');

    const auth = entries.find((e) => e.command === 'auth');
    expect(auth?.rootHelpDescription).toBe('管理身份认证');

    const automation = entries.find((e) => e.command === 'automation');
    expect(automation?.rootHelpDescription).toBe('触发并管理自动化');

    const mcp = entries.find((e) => e.command === 'mcp');
    expect(mcp?.rootHelpDescription).toBe('暴露 MCP 服务端并管理 MCP 客户端');

    const codex = entries.find((e) => e.command === 'codex');
    expect(codex?.rootHelpDescription).toBe('启动 Codex 模式');

    const opencode = entries.find((e) => e.command === 'opencode');
    expect(opencode?.rootHelpDescription).toBe('启动 OpenCode 模式 (ACP)');

    const gemini = entries.find((e) => e.command === 'gemini');
    expect(gemini?.rootHelpDescription).toBe('启动 Gemini 模式 (ACP)');

    const connect = entries.find((e) => e.command === 'connect');
    expect(connect?.rootHelpDescription).toBe('连接 AI 供应商 API 密钥');

    const notify = entries.find((e) => e.command === 'notify');
    expect(notify?.rootHelpDescription).toBe('发送推送通知');

    const install = entries.find((e) => e.command === 'install');
    expect(install?.rootHelpDescription).toBe('安装提供商 CLI 与辅助工具');

    const status = entries.find((e) => e.command === 'status');
    expect(status?.rootHelpDescription).toBe('显示系统状态与推荐修复项');

    const service = entries.find((e) => e.command === 'service');
    expect(service?.rootHelpDescription).toBe('管理自动启动');
    expect(service?.rootHelpDetail).toBe('此电脑上的后台服务');

    const daemon = entries.find((e) => e.command === 'daemon');
    expect(daemon?.rootHelpDescription).toBe('管理本地守护进程');
    expect(daemon?.rootHelpDetail).toBe('手动启动或通过自动启动运行');

    const doctor = entries.find((e) => e.command === 'doctor');
    expect(doctor?.rootHelpDescription).toBe('系统诊断与故障排查');

    const session = entries.find((e) => e.command === 'session');
    expect(session?.rootHelpDescription).toBe('管理会话与执行任务');

    const resume = entries.find((e) => e.command === 'resume');
    expect(resume?.rootHelpDescription).toBe('恢复未活跃的会话');
  });

  it('renders root help in Simplified Chinese while preserving command names and options', () => {
    const help = buildRootHelpText();
    expect(help).toContain('随时随地的 AI 命令行');
    expect(help).toContain('用法:');
    expect(help).toContain('示例:');
    expect(help).toContain('启动默认后端并启用移动端控制');
    expect(help).toContain('服务器选择（全局标志；仅限前缀；不持久化）:');
    expect(help).toContain('kaiwu --refresh-settings  启动前强制刷新账号设置');
    expect(help).toContain('kaiwu --yolo             跳过权限确认启动');
    expect(help).toContain('kaiwu --chrome           为此会话启用 Chrome 浏览器访问权限');
    expect(help).toContain('kaiwu --no-chrome        禁用 Chrome（即使默认开启）');
    expect(help).toContain('kaiwu --js-runtime bun   使用 bun 代替 node 启动 JavaScript 编写的 CLI');
    expect(help).toContain('kaiwu auth login --force 执行身份认证');
    expect(help).toContain('kaiwu profiles list      列出可用的后端配置文件');
    expect(help).toContain('kaiwu doctor             运行诊断');
  });

  it('renders auth --help in Simplified Chinese with preserved command options', () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });
    try {
      showAuthHelp();
      const output = logs.join('\n');
      expect(output).toContain('身份认证管理');
      expect(output).toContain('用法:');
      expect(output).toContain('选项:');
      expect(output).toContain('登录并认证 Kaiwu 账号');
      expect(output).toContain('通过 SSH 进行全自动远程配对');
      expect(output).toContain('创建基于认领机制的认证请求（适用于无头环境）');
      expect(output).toContain('使用本地凭据批准认证请求');
      expect(output).toContain('等待批准并写入此机器的凭据');
      expect(output).toContain('退出登录（默认退出当前活跃中继）');
      expect(output).toContain('显示身份认证状态');
      expect(output).toContain('显示此帮助信息');
      expect(output).toContain('不尝试打开浏览器（仅打印 URL）');
      expect(output).toContain('重新认证前清除凭据与机器 ID 并停止守护进程');
      expect(output).toContain('输出机器可读的 JSON（推荐容器环境使用）');
      expect(output).toContain('主密钥绝不会离开你的移动设备或网页端');
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps tmux disallow decisions aligned with the command manifest', () => {
    expect(isTmuxAllowedCommand('codex')).toBe(true);
    expect(isTmuxAllowedCommand('resume')).toBe(true);
    expect(isTmuxAllowedCommand('daemon')).toBe(false);
    expect(isTmuxAllowedCommand('service')).toBe(false);
    expect(isTmuxAllowedCommand('status')).toBe(false);
    expect(isTmuxAllowedCommand('session')).toBe(false);
    expect(isTmuxAllowedCommand('sessions')).toBe(false);
    expect(isTmuxAllowedCommand('automation')).toBe(false);
    expect(isTmuxAllowedCommand('install')).toBe(false);
  });

  // The installers gate every post-install `kaiwu <command>` invocation on the
  // CLI's own root help (scripts/release/installers/install.sh
  // `installed_cli_supports_command_surface`, install.ps1
  // `Test-InstalledCliSupportsCommandSurface`). If `setup` ever stops being
  // listed there, `install --run setup` and the guided first-run handoff both
  // refuse to run, so pin the exact shape those installers look for.
  it('lists the command surfaces the installers gate their post-install handoff on', () => {
    const help = buildRootHelpText();
    const installerGate = (subcommand: string): RegExp =>
      new RegExp(String.raw`^\s*(kaiwu\.exe|kaiwu)\s+${subcommand}\b`, 'mu');

    expect(help).toMatch(installerGate('setup'));
    expect(help).toMatch(installerGate('auth'));
    // A surface the CLI does not advertise must not satisfy the gate, or the
    // check would pass for anything.
    expect(help).not.toMatch(installerGate('definitely-not-a-command'));
  });
});
