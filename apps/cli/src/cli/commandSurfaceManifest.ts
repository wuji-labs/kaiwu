export type CliCommandSurfaceEntry = Readonly<{
  command: string | null;
  rootHelpLabel?: string;
  rootHelpDescription?: string;
  rootHelpDetail?: string;
  allowTmux: boolean;
}>;

export const RESUME_COMMAND_USAGE = 'kaiwu resume [<session-id-or-prefix>]';

const COMMAND_SURFACE_MANIFEST: readonly CliCommandSurfaceEntry[] = [
  {
    command: null,
    rootHelpLabel: 'kaiwu [options]',
    rootHelpDescription: '启动默认后端并启用移动端控制',
    allowTmux: true,
  },
  {
    command: 'setup',
    rootHelpLabel: 'kaiwu setup',
    rootHelpDescription: '连接此电脑到你的 Kaiwu 账号',
    rootHelpDetail: '选择中继服务所在位置，然后登录',
    allowTmux: false,
  },
  {
    command: 'auth',
    rootHelpLabel: 'kaiwu auth',
    rootHelpDescription: '管理身份认证',
    allowTmux: false,
  },
  {
    command: 'automation',
    rootHelpLabel: 'kaiwu automation',
    rootHelpDescription: '触发并管理自动化',
    allowTmux: false,
  },
  {
    command: 'mcp',
    rootHelpLabel: 'kaiwu mcp',
    rootHelpDescription: '暴露 MCP 服务端并管理 MCP 客户端',
    allowTmux: false,
  },
  {
    command: 'codex',
    rootHelpLabel: 'kaiwu codex',
    rootHelpDescription: '启动 Codex 模式',
    allowTmux: true,
  },
  {
    command: 'opencode',
    rootHelpLabel: 'kaiwu opencode',
    rootHelpDescription: '启动 OpenCode 模式 (ACP)',
    allowTmux: true,
  },
  {
    command: 'gemini',
    rootHelpLabel: 'kaiwu gemini',
    rootHelpDescription: '启动 Gemini 模式 (ACP)',
    allowTmux: true,
  },
  {
    command: 'connect',
    rootHelpLabel: 'kaiwu connect',
    rootHelpDescription: '连接 AI 供应商 API 密钥',
    allowTmux: false,
  },
  {
    command: 'notify',
    rootHelpLabel: 'kaiwu notify',
    rootHelpDescription: '发送推送通知',
    allowTmux: false,
  },
  {
    command: 'install',
    rootHelpLabel: 'kaiwu install',
    rootHelpDescription: '安装提供商 CLI 与辅助工具',
    allowTmux: false,
  },
  {
    command: 'status',
    rootHelpLabel: 'kaiwu status',
    rootHelpDescription: '显示系统状态与推荐修复项',
    allowTmux: false,
  },
  {
    command: 'service',
    rootHelpLabel: 'kaiwu service',
    rootHelpDescription: '管理自动启动',
    rootHelpDetail: '此电脑上的后台服务',
    allowTmux: false,
  },
  {
    command: 'daemon',
    rootHelpLabel: 'kaiwu daemon',
    rootHelpDescription: '管理本地守护进程',
    rootHelpDetail: '手动启动或通过自动启动运行',
    allowTmux: false,
  },
  {
    command: 'doctor',
    rootHelpLabel: 'kaiwu doctor',
    rootHelpDescription: '系统诊断与故障排查',
    allowTmux: false,
  },
  {
    command: 'uninstall',
    allowTmux: false,
  },
  {
    command: 'logout',
    allowTmux: false,
  },
  {
    command: 'attach',
    allowTmux: false,
  },
  {
    command: 'self',
    allowTmux: false,
  },
  {
    command: 'server',
    allowTmux: false,
  },
  {
    command: 'session',
    allowTmux: false,
    rootHelpLabel: 'kaiwu session',
    rootHelpDescription: '管理会话与执行任务',
  },
  {
    command: 'resume',
    allowTmux: true,
    rootHelpLabel: RESUME_COMMAND_USAGE,
    rootHelpDescription: '恢复未活跃的会话',
  },
  {
    // Compatibility alias: intentionally accepted but omitted from root help.
    command: 'sessions',
    allowTmux: false,
  },
  {
    // Compatibility alias: intentionally accepted but omitted from root help.
    command: 'automations',
    allowTmux: false,
  },
];

export function listRootHelpCommands(): readonly CliCommandSurfaceEntry[] {
  return COMMAND_SURFACE_MANIFEST.filter((entry) => typeof entry.rootHelpLabel === 'string');
}

export function isTmuxAllowedCommand(command: string | null | undefined): boolean {
  if (!command) return true;
  const entry = COMMAND_SURFACE_MANIFEST.find((candidate) => candidate.command === command);
  return entry ? entry.allowTmux : true;
}
