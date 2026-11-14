/**
 * Renders the agent capability reference from the agent manifest.
 *
 * This page used to be maintained by hand as `features/feature-matrix.mdx`, and
 * it drifted the way hand-maintained tables always do: it listed 10 of 14
 * agents, omitted Cursor entirely, and marked three default-on features
 * "Experimental" while the genuinely experimental ones were not distinguished.
 * A capability matrix is a projection of data that already exists in code, so
 * it should be projected, not retyped.
 *
 * Two sources, because the data genuinely lives in two places:
 *
 *   - `@happier-dev/agents` owns what an agent can *do* — resume, fork,
 *     steering, media, tools, models, auth. Imported from the built package so
 *     the types are real rather than regex-guessed.
 *   - `apps/ui/sources/agents/providers/<id>/core.ts` owns whether the app
 *     presents the agent as Stable or Experimental, which is a product decision
 *     the client makes and the shared package does not model. That one field is
 *     read from source, and `collectStability` throws if any agent is missing,
 *     so a shape change fails loudly here instead of silently publishing a
 *     wrong status column.
 *
 * Regenerate with `yarn --cwd apps/docs generate:reference`. The drift test in
 * `generateAgentReference.test.mjs` fails the build if the published page and
 * this renderer disagree.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const UI_PROVIDERS = join(REPO, 'apps', 'ui', 'sources', 'agents', 'providers');
const UI_PLUGIN_BUNDLE = join(
  REPO, 'apps', 'ui', 'sources', 'agents', 'registry', 'generatedBundledPluginEntries.ts',
);
export const OUTPUT_PATH = join(HERE, '..', 'content', 'docs', 'agents', 'capabilities.mdx');

const AGENTS_DIST = join(REPO, 'packages', 'agents', 'dist', 'index.js');
const CLI_RUNTIME_DIST = join(REPO, 'packages', 'agents', 'dist', 'providers', 'providerCliRuntime.js');

/** Display names as the app renders them in the AI backends list. */
const DISPLAY_NAMES = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini: 'Gemini',
  auggie: 'Auggie',
  qwen: 'Qwen Code',
  kimi: 'Kimi',
  kilo: 'Kilo',
  kiro: 'Kiro',
  customAcp: 'Custom ACP',
  pi: 'Pi',
  copilot: 'Copilot',
  cursor: 'Cursor',
  grok: 'Grok',
};

/**
 * Read `availability.experimental` for every agent, or fail.
 *
 * Two layouts are supported because the two lines of the codebase store this
 * differently and this generator is meant to serve both:
 *
 *   - **Per-agent core files** (`agents/providers/<id>/core.ts`), the 0.2.x
 *     layout, where each agent owns its own module.
 *   - **A single generated bundle** (`agents/registry/generatedBundledPluginEntries.ts`),
 *     the layout after agents became plugins, where every agent's core config
 *     is emitted into one file.
 *
 * Whichever is present, a missing agent throws rather than defaulting. Silently
 * rendering an experimental agent as Stable is the failure this guards against.
 */
export function collectStability({ providersDir = UI_PROVIDERS, bundlePath = UI_PLUGIN_BUNDLE, agentIds } = {}) {
  const bundled = readBundledStability(bundlePath);
  const stability = {};
  const missing = [];
  for (const id of agentIds) {
    const fromDir = readAgentDirStability(providersDir, id);
    const value = fromDir ?? bundled[id] ?? null;
    if (value === null) missing.push(id);
    else stability[id] = value;
  }
  if (missing.length) {
    throw new Error(
      `Could not read availability.experimental for: ${missing.join(', ')}. ` +
        `Looked in ${providersDir} and ${bundlePath}.`,
    );
  }
  return stability;
}

function readAgentDirStability(providersDir, id) {
  let source;
  try {
    source = readFileSync(join(providersDir, id, 'core.ts'), 'utf8');
  } catch {
    return null;
  }
  const match = source.match(/availability\s*:\s*\{[^}]*?experimental\s*:\s*(true|false)/s);
  return match ? (match[1] === 'true' ? 'Experimental' : 'Stable') : null;
}

/** `id: 'claude', … availability: { experimental: false }` within one bundle. */
function readBundledStability(bundlePath) {
  let source;
  try {
    source = readFileSync(bundlePath, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const match of source.matchAll(
    /id:\s*'([a-zA-Z]+)'[\s\S]{0,600}?availability:\s*\{[^}]*?experimental:\s*(true|false)/g,
  )) {
    out[match[1]] = match[2] === 'true' ? 'Experimental' : 'Stable';
  }
  return out;
}

/*
 * The docs site is published in Chinese, so every string this renderer emits is
 * Chinese too. Stability stays 'Stable' / 'Experimental' internally (that is the
 * vocabulary of `availability.experimental`) and is only labelled at render time.
 */
const YES = '支持';
const NO = '—';
const STABILITY_LABELS = { Stable: '稳定版', Experimental: '实验版' };

/** The CLI binary, as published in apps/cli/package.json `bin`. */
const CLI_BIN = 'kaiwu';

function supported(value) {
  if (value === 'supported' || value === true) return YES;
  if (value === 'experimental') return '实验性';
  if (value === 'unsupported' || value === false || value == null) return NO;
  return String(value);
}

/**
 * What kind of session modes an agent has, and where the list comes from.
 *
 * This replaced a bare "Plan mode: yes/no" column, which was actively
 * misleading. `supportsPlanMode` is derived from `semantics === 'agent-modes'`
 * and describes whether Kaiwu offers Claude's *dedicated* plan-mode control —
 * not whether the agent has a plan mode at all. Codex's modes arrive over ACP
 * and really can include `plan`; rendering that as a dash told readers the
 * opposite of the truth.
 */
function sessionModesCell(descriptor) {
  if (!descriptor || descriptor.source === 'none') return NO;
  const kind = descriptor.semantics === 'agent-modes' ? 'Agent 模式' : '策略预设';
  const origin = descriptor.source === 'acp' ? '来自 Agent' : '内置';
  return `${kind}（${origin}）`;
}

function modelsCell(config) {
  if (!config?.supportsSelection) return '不可选择';
  const parts = [];
  if (config.dynamicProbe === 'static-only') parts.push('固定列表');
  else parts.push('向 Agent 查询');
  if (config.supportsFreeform) parts.push('允许自定义 ID');
  return parts.join('，');
}

function installCell(spec) {
  const managed = spec?.managedInstall;
  if (managed?.kind === 'managed_package' && managed.packageName) return `\`${managed.packageName}\``;
  if (spec?.manualInstallKind === 'command') return '官方独立安装器';
  return '官方配方';
}

function authCell(probe) {
  if (!probe) return NO;
  const bits = [];
  if (probe.credentialPaths?.length) bits.push(`\`${probe.credentialPaths[0]}\``);
  if (probe.envVars?.length) bits.push(probe.envVars.map((v) => `\`${v}\``).join('、'));
  return bits.length ? bits.join(' 或 ') : 'Agent 自行管理';
}

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, rule, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export async function renderAgentReferenceMarkdown({
  agentsModulePath = AGENTS_DIST,
  cliRuntimeModulePath = CLI_RUNTIME_DIST,
  providersDir = UI_PROVIDERS,
  bundlePath = UI_PLUGIN_BUNDLE,
} = {}) {
  const agents = await import(`file://${agentsModulePath}`);
  const cliRuntime = await import(`file://${cliRuntimeModulePath}`);
  const ids = [...agents.AGENT_IDS];
  const stability = collectStability({ providersDir, bundlePath, agentIds: ids });

  const name = (id) => DISPLAY_NAMES[id] ?? id;
  const core = (id) => agents.AGENTS_CORE[id];

  const overview = table(
    ['Agent', '启动命令', '状态', '模型', '托管安装'],
    ids.map((id) => [
      `**${name(id)}**`,
      `\`${CLI_BIN} ${core(id).cliSubcommand}\``,
      STABILITY_LABELS[stability[id]],
      modelsCell(agents.getAgentModelConfig(id)),
      installCell(cliRuntime.getProviderCliRuntimeSpec(id)),
    ]),
  );

  const sessions = table(
    ['Agent', '恢复自有会话', '分叉对话', '从消息处分叉', '回滚', '声明会话列表支持'],
    ids.map((id) => {
      const c = core(id).sessionCapabilities;
      return [
        `**${name(id)}**`,
        supported(core(id).resume?.vendorResume),
        supported(c.sessionFork?.conversation),
        supported(c.sessionFork?.fromMessage),
        supported(c.sessionRollback?.conversation),
        supported(c.sessionListing),
      ];
    }),
  );

  const runtime = table(
    ['Agent', '引导进行中的轮次', '会话模式', '独立计划控件', '采纳编辑'],
    ids.map((id) => {
      const advanced = agents.getAgentAdvancedModeCapabilities(id);
      return [
        `**${name(id)}**`,
        supported(core(id).runtimeInput?.inFlightSteerSupported),
        sessionModesCell(agents.getAgentSessionModeDescriptor(id)),
        supported(advanced.supportsPlanMode),
        supported(advanced.supportsAcceptEdits),
      ];
    }),
  );

  const mediaTools = table(
    ['Agent', '发布生成的媒体', '声明图片输入', '声明原生图片生成', 'Kaiwu 工具', '已连接服务'],
    ids.map((id) => {
      const m = agents.getAgentMediaCapabilities(id);
      const t = core(id).tools;
      const cs = core(id).connectedServices?.supportedServiceIds ?? [];
      return [
        `**${name(id)}**`,
        supported(m.emitsSessionMedia),
        supported(m.acceptsImageInput),
        supported(m.nativeImageGeneration),
        t?.support === 'supported' ? `${YES}（\`${t.delivery}\`）` : NO,
        cs.length ? cs.map((s) => `\`${s}\``).join(', ') : NO,
      ];
    }),
  );

  const auth = table(
    ['Agent', '凭据存储位置', '后台鉴权检查'],
    ids.map((id) => {
      const probe = agents.getAgentAuthProbeConfig(id);
      return [`**${name(id)}**`, authCell(probe), probe?.backgroundChecks === 'safe' ? '自动' : '仅手动'];
    }),
  );

  const stable = ids.filter((id) => stability[id] === 'Stable').map(name);
  const aliased = ids
    .filter((id) => core(id).flavorAliases?.length)
    .map((id) => `\`${core(id).cliSubcommand}\` 同样支持 ${core(id).flavorAliases.map((a) => `\`${a}\``).join('、')}`);

  return `---
title: Agent 能力
description: 各编程 Agent 在 Kaiwu 中支持与不支持的功能，根据 Agent 清单生成。
---
Kaiwu 负责驱动各类编程 Agent，而非取而代之。因此，任意特定会话的能力边界，取决于 Kaiwu 所支持的功能与该 Agent 自身 CLI 所暴露能力的交集——这也是我们通过多张表格分别对照、而非罗列单一功能列表的原因。

本页的所有表格均生成自 \`packages/agents\` 中的 Agent 清单，因而反映的是当前文档对应版本的实际构建状态，而非维基页面上次被更新时的陈旧记录。表格中的破折号表示该 Agent 本身不支持该项能力，并不代表 Kaiwu 尚未对其提供支持。

在全部 ${ids.length} 款 Agent 中，有 ${stable.length} 款被标记为稳定版（Stable）：${stable.join('、')}。其余 Agent 均为实验版（Experimental）——它们完全可用，且每天都有人使用，只是集成历史较短，后续更可能发生变动。Agent 的可用性与功能的可用性相互独立；关于后者的详细说明，请参阅[服务端特性开关](/extras/feature-flags)。

## Agent 概览

${overview}

若“托管安装”一列列出了具体软件包，Kaiwu 即可在设备详情页中直接为你安装该 Agent。若标注为官方独立安装器，则需先自行运行该安装器——确切命令请参见各 Agent 的专属页面。

**Custom ACP** 并非内置绑定的 Agent，而是用于让 Kaiwu 连接任何支持 Agent Client Protocol 的 Agent。因此该行描述的是适配器本身的能力，而非某个具体厂商的实现。详情请参见 [Custom ACP](/agents/custom-acp)。

多个子命令支持别名，你习惯的键入名称通常都能直接生效：${aliased.join('；')}。

## 会话

恢复、浏览、分叉与回滚，是大家通常以为处处适用的四项功能。但事实并非如此。

${sessions}

“恢复自有会话”是指 Kaiwu 能够重新挂载该 Agent 在 Kaiwu 外部启动的对话。“分叉”则指 Agent 自身的运行时支持派生分支对话；如果 Agent 原生不支持，Kaiwu 的重放分叉依然可用，因为那是 Kaiwu 自身而非 Agent 提供的机制。详见[会话分叉](/sessions/session-forking)。

最后一列只是一项能力声明，并非功能拦截开关——目前并无代码读取该字段，因此它并不决定你是否能浏览 Agent 的自有会话。关于实际能够浏览并导入的内容，请参阅[继续会话](/sessions/continuing-a-session)。

## 执行轮次

${runtime}

“引导”允许你在某个轮次正在执行时追加纠偏指令，而无需直接中断它。若 Agent 不支持实时引导，Kaiwu 会中断当前执行并重新发送；这种方式虽然稍慢，但丢失的上下文远比听上去要少——详见[引导](/sessions/steering)。

**会话模式不等同于权限模式。** 当模式列表*来自 Agent* 时，Kaiwu 会展示该构建版本为该会话声明的所有模式；因此不同版本间的选项可能有所差异，且当运行时未提供任何模式时，“模式”控件会自动隐藏。“独立计划控件”下方的破折号表示 Kaiwu 没有为该 Agent 提供专门的计划交互控件——而**不是**说该 Agent 缺少计划模式。例如，Codex 就是通过“模式”控件来切换到 \`plan\` 的。

## 媒体与工具

${mediaTools}

其中的两列描述的是对应集成所**声明**的能力，而非 Kaiwu 强制约束的行为。当你决定是否要附加屏幕截图时，这种区别至关重要。

**发布生成的媒体**属于实际行为特性：Kaiwu 在接入 Agent 运行时会读取该项配置，因此此处标注为支持的 Agent 确实能将生成的图像输出到会话中。

**声明图片输入**与**声明原生图片生成**是对应集成对该 Agent 做出的声明，目前没有任何代码路径以此作为硬性拦截条件。在实践中，基于 ACP 的会话会直接将受信任的本地图像附加至提示词中，而不论清单中如何声明——至于 Agent 随后能否妥善处理这些图像，取决于 Agent 本身，而非 Kaiwu。因此，这两列中的破折号应理解为“未作声明”，而非“会被拒绝”，并且部分声明可能会滞后于运行时的实际能力。

## 身份验证

${auth}

后台检查标注为“仅手动”的 Agent 不会定时重新探测；它们的状态会在你打开对应后端的设置界面或启动会话时刷新。详见[Agent 身份验证](/agents/provider-authentication)。

## 相关内容

- [编程 Agent](/agents) —— 每款 Agent 的独立页面，包含配置方法与已知限制。
- [模型与引擎选择](/agents/model-and-engine-selection)
- [服务端特性开关](/extras/feature-flags)
`;
}

const isEntrypoint = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  const { writeFileSync } = await import('node:fs');
  const markdown = await renderAgentReferenceMarkdown();
  writeFileSync(OUTPUT_PATH, markdown, 'utf8');
  console.log(`wrote ${OUTPUT_PATH}`);
}
