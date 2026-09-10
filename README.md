<div align="center">
  <img src="/.github/hero.png" title="Kaiwu" alt="Kaiwu (无极开物) - Mobile, Web and Desktop client for Claude Code, Codex, OpenCode, Pi, Cursor" width="850" />

  # 无极开物 (Kaiwu)

  ### 移动端、网页端与桌面端 AI 编程全平台伴侣
  ### Mobile, Web and Desktop client for Claude Code, Codex, OpenCode, Pi, Cursor, ...
  
  在您的工作站、服务器与云主机上运行 Claude Code、Codex、Gemini、OpenCode 等 AI Agent，随时随地从手机、浏览器或桌面端无缝协同接续。

  **端到端加密 · 100% 自托管 · 原生免环境架构**<br />
  **End-to-end encrypted. Self-hostable. Built by developers, for developers.**
</div>

## 什么是无极开物 (What is Kaiwu)?

**无极开物 (Kaiwu)** 是一个开源、端到端加密的跨设备 AI 编程助手与客户端。

它允许您在**本地计算机或云端主机**上运行 AI 编程会话，并在任何时刻通过**手机端、Web 控制台或桌面应用**进行实时监控、审批控制、远程转向与上下文无缝接续。

无论是离开工位还是在多台设备间切换工作流，无极开物都能保持您的 AI 编程会话持续在线、即时响应。

---

## 快速安装 (Installation)

### 第一步：在计算机上安装 CLI

#### Linux / macOS
```bash
curl -fsSL https://kaiwu.chengqiyun.com/install | bash
```

#### Windows (PowerShell)
```powershell
iwr https://kaiwu.chengqiyun.com/install.ps1 -useb | iex
```

> **说明**：Windows 采用免 Node.js 原生绿色架构，通过国内腾讯云 BGP 高速通道极速部署。提供 `kaiwu` 主命令与 `happier` 兼容别名。

若需要通过 npm 全局安装：
```bash
npm install -g @happier-dev/cli
```

### 第二步：配对与认证登录

```bash
kaiwu auth login
```

- 推荐通过手机扫码快速配对登录，账户与密钥将安全加密存储在您的移动设备上。
- 在任何新设备登录同一账户即可实现所有机器工作流互联。

### 第三步：在任何项目目录中启动 AI 编程会话

```bash
# 启动开物默认 AI 会话
kaiwu

# 或指定底层 Agent 引擎：
kaiwu codex
kaiwu opencode
kaiwu gemini
kaiwu kilo
kaiwu kimi
kaiwu qwen
```

### 第四步：随时随地协同与接续

单人高效编程，或邀请团队成员加入会话协同。无极开物在您的本地开发环境与移动设备之间搭建安全的高速通道。

---

## 核心特性 (Key Features)

- **多模型与 Agent 全面支持 (Broad provider support)**<br />
  统一接入 **Claude Code, Codex, OpenCode, Gemini, GitHub Copilot, Kiro, Pi, Kilo, Kimi, Qwen, Augment** 以及任意符合 ACP 规范的自定义 CLI 工具。

- **实时浏览、跟进并接管本地已有会话**<br />
  直接在开物中打开机器上现有的 Codex、Claude 或 OpenCode 会话，实时同步外部启动的会话，或一键接管并无缝接入开物生态。

- **会话分支与回放 (Session forking and replay)**<br />
  在任意历史消息处创建会话分支（Fork），保留完整上下文。原生支持 OpenCode/Codex 分支，其余模型支持开物智能回放。

- **跨机器会话交接 (Session handoff between machines)**<br />
  将正在进行的会话（包含 Provider 状态与项目目录）无缝转移到另一台机器，保持相同 Session ID 与执行连续性。

- **终端与远程接续 (Attach to a running session)**<br />
  在 App 中启动会话后，随时在终端使用 `kaiwu attach` 重连并接管，亦可随时切回 App 远程控制。

- **持久化会话机制 (Persistent sessions)**<br />
  支持重启后自动恢复会话、归档与稍后查阅；支持 tmux 托管终端会话。

- **多端流转无缝切换 (Seamless switching)**<br />
  在终端、桌面客户端、Web 控制台与手机移动端之间自由切换，上下文与输入队列始终保持最新状态。

- **团队实时协同 (Collaborative sessions)**<br />
  与团队成员共享正在运行的会话，或通过只读链接公开分享，支持按用户名直接邀请协同。

- **并行 Agent 与 Claude 团队协作**<br />
  在任一会话中发起并行 Review、规划或委托执行；创建与调度多 Agent 团队，全景监控子代理运行进展。

- **语音伴侣助手 (Voice assistant)**<br />
  不仅是语音转文字，而是具备系统级 Action 控制权限的 AI 同事：监控所有会话状态、朗读并代为回复审批请求、听写下发指令，支持 ElevenLabs、Kokoro 神经语音合成及系统级端侧语音识别。

- **全局收件箱 (Inbox)**<br />
  跨所有会话和机器的集中控制台，集中呈现权限请求、交互提示（`AskUserQuestion`、`ExitPlanMode`）与待办审批。

- **消息暂存队列 (Pending queue)**<br />
  在 Agent 执行繁忙或离线时提前暂存多条消息，支持随时编辑、调序与删除。

- **实时转向与中断 (Steering and interrupts)**<br />
  在 Agent 运行中下发调整指令，支持兼容后端直接注入当前 Turn，保持精确执行控制。

- **内置 Git 与代码浏览器**<br />
  内置完整版本控制能力：查看 Diff、修改文件、提交、分支、暂存、Worktree 与远程分支操作，无需离开界面。

- **项目与 Worktree 管理**<br />
  持久化项目工作空间，支持浏览代码库、收集代码评审意见并在特定 Worktree 独立上下文中快速启动会话。

- **内置交互终端 (Embedded terminal)**<br />
  依托受控机器的实时交互 Shell，支持底部停靠、侧边栏或全屏使用。

- **附件与多模态**<br />
  支持在各端会话中上传图片与文件上下文。

- **MCP 服务生态支持**<br />
  一次性配置 MCP（Model Context Protocol）服务器，跨所有模型、机器与会话复用。

- **企业级与自托管就绪**<br />
  支持独立部署开物中继服务（Relay Server），支持 GitHub OAuth、OIDC、mTLS 证书认证及组织/团队权限管控，全面适配 Docker、PostgreSQL、SQLite 等基础设施。

---

## 安全与隐私 (Security & Privacy)

无极开物始终将数据安全与隐私保护置于核心架构：

- **端到端加密 (End-to-End Encryption)**  
  基于 TweetNaCl 等现代密码学体系构建。
- **零知识架构 (Zero-Knowledge Architecture)**  
  您的代码与会话在发送至网络前已在本地完成加密，中继服务器无权且无法解密您的数据，密钥仅保存在您的可信设备中。

---

## 架构与核心组件 (Architecture)

- **中继服务端 (Relay Server)**:
  - 负责存储加密会话、消息与用户配置
  - 协调移动端/Web端与受控机器 Daemon 间的安全长连接
  - 支持官方公开服务与私有化自托管
- **机器守护进程 (Machine Daemon)**:
  - 运行在开发机上的常驻后台进程，调度本地环境、终端与模型 CLI
  - 通过中继服务接收各端指令并同步会话状态
- **用户客户端 (UI / App)**:
  - 跨平台原生移动 App（iOS / Android）
  - Web 控制台界面
  - 桌面客户端（Windows / macOS / Linux）

---

## 私有化自托管 (Self-Hosting)

无极开物完全支持 100% 私有化自建部署：

### 本机一键安装自托管中继服务
```bash
kaiwu relay host install --mode system
```

默认使用嵌入式 SQLite 数据库，并可结合 Tailscale、Caddy 或内网反向代理安全对外暴露。

### Docker 容器化部署
支持预构建 Docker 镜像或从源码构建，详情请参阅官方部署文档。

---

## 从源码运行与本地开发 (Running from Source)

```bash
npm i -g yarn
git clone https://github.com/wujilabs/wuji-labs-app.git
cd wuji-labs-app
yarn
yarn build
yarn cli:activate
yarn tui
```

常用命令：
- `yarn dev`: 启动本地开发技术栈（Server + UI + Daemon）
- `yarn tui`: 在终端交互界面中运行开发技术栈
- `yarn build`, `yarn start`, `yarn stop`: 生产级构建与启停
- `yarn auth login`, `yarn daemon`, `yarn kaiwu`: 认证、守护进程与 CLI 流程
- `yarn logs`: 查看各组件实时日志

---

## 开源许可 (License)

MIT License — 详见 [LICENSE](LICENCE) 文件。

⸻

Code faster. Code together. 乾元执中 · 开物成务。
