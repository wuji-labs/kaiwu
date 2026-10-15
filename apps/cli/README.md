# Kaiwu

Code on the go — control AI coding agents from your mobile device.

Free. Open source. Code anywhere.

## Installation

```bash
npm install -g @happier-dev/cli
```

## Testing

```bash
yarn --cwd apps/cli test:unit
```

Integration (real process/fs/network style):

```bash
yarn --cwd apps/cli test:integration
```

Slow build+wiring validation suite:

```bash
yarn --cwd apps/cli test:slow
```

## Usage

### First-time authentication (recommended)

```bash
kaiwu auth login
```

Recommended first run:
1. Choose the mobile option (recommended).
2. Scan the QR/deep link in the Kaiwu mobile app.
3. If you already use Kaiwu on another device, sign in with that same account.
4. If you are logged out, complete sign in/create account, then continue terminal approval (the app returns you automatically).

### Claude (default)

```bash
kaiwu
```

This will:
1. Start a Claude Code session
2. Display a QR code to connect from your mobile device
3. Allow real-time session sharing between Claude Code and your mobile app

### Multi-server quickstart

```bash
kaiwu server add --name company --server-url https://api.company.example --webapp-url https://app.company.example --use
kaiwu --server company auth login
```

### Gemini

```bash
kaiwu gemini
```

Start a Gemini CLI session with remote control capabilities.

**First time setup:**
```bash
# Authenticate with Google
kaiwu connect gemini
```

## Commands

### Main Commands

- `kaiwu` – Start Claude Code session (default)
- `kaiwu gemini` – Start Gemini CLI session
- `kaiwu codex` – Start Codex mode

### Utility Commands

- `kaiwu auth` – Manage authentication
- `kaiwu connect` – Store AI vendor API keys in Kaiwu cloud
- `kaiwu notify` – Send a push notification to your devices
- `kaiwu daemon` – Manage background service
- `kaiwu doctor` – System diagnostics & troubleshooting

### Connect Subcommands

```bash
kaiwu connect gemini     # Authenticate with Google for Gemini
kaiwu connect claude     # Authenticate with Anthropic
kaiwu connect codex      # Authenticate with OpenAI
kaiwu connect status     # Show connection status for all vendors
```

### Gemini Subcommands

```bash
kaiwu gemini                      # Start Gemini session
kaiwu gemini model set <model>    # Set default model
kaiwu gemini model get            # Show current model
kaiwu gemini project set <id>     # Set Google Cloud Project ID (for Workspace accounts)
kaiwu gemini project get          # Show current Google Cloud Project ID
```

**Suggested models:** `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` (freeform model ids are also supported)

## Options

### Claude Options

- `-m, --model <model>` - Claude model to use (default: sonnet)
- `-p, --permission-mode <mode>` - Permission mode: `default`, `read-only`, `safe-yolo`, `yolo`, `plan` (aliases like `ro`, `safe`, `full-access`, `accept-edits`, `bypass-permissions` are accepted)
- `--permission-mode-updated-at <unix-ms>` - Optional timestamp (ms) for ordering permission changes across devices
- `--claude-arg ARG` - Pass additional argument to Claude CLI

### Session Options (agent commands)

These flags are accepted by agent commands like `codex`, `gemini`, `opencode`, `auggie`, `qwen`, `kimi`, `kilo`:

- `--permission-mode <mode>` - Permission mode (aliases accepted; stored canonically in session metadata)
- `--permission-mode-updated-at <unix-ms>` - Optional timestamp (ms) for ordering permission changes across devices
- `--agent-mode <id>` - ACP session mode id (e.g. `plan`), when supported by the provider
- `--agent-mode-updated-at <unix-ms>` - Optional timestamp (ms) for ordering ACP mode changes across devices
- `--model <id>` - Session model override (capability-driven; may be best-effort depending on provider)
- `--model-updated-at <unix-ms>` - Optional timestamp (ms) for ordering model changes across devices

### Global Options

- `-h, --help` - Show help
- `-v, --version` - Show version

## Permissions

Kaiwu uses **one permission vocabulary** across providers.

You can set permissions either:
- from the CLI when starting a session (`--permission-mode ...`), or
- from the app UI (in-session picker and Session settings).

The selected permission mode is stored canonically in **session metadata** so it stays consistent across devices and when switching local ↔ remote.

### Common examples

```bash
# Claude (default) in safe-yolo
kaiwu --permission-mode safe-yolo

# Codex in read-only (deny write-like tools)
kaiwu codex --permission-mode read-only

# Gemini in yolo (aliases accepted)
kaiwu gemini --permission-mode full-access

# OpenCode in plan mode (ACP session mode)
kaiwu opencode --agent-mode plan

# Kilo in plan mode (ACP session mode)
kaiwu kilo --agent-mode plan

# Select a model when supported
kaiwu gemini --model gemini-2.5-pro

# Provider-native legacy tokens are accepted as aliases
kaiwu --permission-mode accept-edits        # => safe-yolo (canonical)
kaiwu --permission-mode bypass-permissions  # => yolo (canonical)

# Legacy: some ACP agents used to accept plan as a permission. Kaiwu still accepts it,
# but will map it to `--agent-mode plan` (and warn) when the provider exposes ACP modes.
kaiwu opencode --permission-mode plan        # => --agent-mode plan (deprecated)
kaiwu kilo --permission-mode plan            # => --agent-mode plan (deprecated)
```

### What’s enforced where

Depending on the provider, a permission mode can map to:
- a provider-native “session mode” (when available), and/or
- Kaiwu’s tool approval gating (read-only/safe-yolo/yolo behavior).

Important provider constraints:
- **Codex (ACP)**: provider session modes are policy presets (approval + sandbox), not generic “plan/build” agent modes. Kaiwu keeps permissions as the primary user control and maps to the closest preset.
- **Codex (MCP)**: approval behavior can change mid-session, but many sandbox/environment constraints are decided at session start.
- **Claude**: `read-only` is best-effort (Claude does not have a strict read-only mode); Kaiwu will map to the closest supported behavior.
- **ACP “Mode”** (`--agent-mode`): this is separate from permissions and is provider-defined (for example OpenCode “plan” vs “build”).

Model selection behavior:
- **Claude**: applies on the next prompt.
- **Codex (MCP)**: model is start-session scoped.
- **ACP agents**: Kaiwu prefers live `session/set_model`, with config-option fallback when available.
- **Gemini (ACP)**: model changes may recreate the underlying ACP process; Kaiwu preserves context via replay/history.

For the full user guide (UI behavior, defaults, apply timing), see the app docs:
- [Permissions](https://github.com/wuji-labs/kaiwu/blob/main/apps/docs/content/docs/features/permissions.mdx)

## Environment Variables

### Kaiwu Configuration

- `HAPPIER_PUBLIC_SERVER_URL` - Canonical/share server URL (used in QR/deep links; should work from your phone)
- `HAPPIER_LOCAL_SERVER_URL` - Optional local API URL optimization (only used for API calls, never embedded in links)
- `HAPPIER_SERVER_URL` - Legacy/compat server URL
  - If `HAPPIER_PUBLIC_SERVER_URL` is unset: treated as the canonical/share URL
  - If `HAPPIER_PUBLIC_SERVER_URL` is set: treated as a local API URL override
- `HAPPIER_WEBAPP_URL` - Custom web app URL (default: https://kaiwu.wujilabs.cn)
- `HAPPIER_HOME_DIR` - Custom home directory for Kaiwu data (default: ~/.happier)
- `HAPPIER_DISABLE_CAFFEINATE` - Disable macOS sleep prevention (set to `true`, `1`, or `yes`)
- `HAPPIER_EXPERIMENTAL` - Enable experimental features (set to `true`, `1`, or `yes`)
- `HAPPIER_ENCRYPTION_REQUIREMENT` - Set to `require_e2ee` to make the CLI/daemon refuse plaintext Account settings and sessions regardless of the server-advertised mode. The default is `follow_account`; invalid non-empty values stop startup.

### Gemini Configuration

- `GEMINI_MODEL` - Override default Gemini model
- `GOOGLE_CLOUD_PROJECT` - Google Cloud Project ID (required for Workspace accounts)

## Gemini Authentication

### Personal Google Account

Personal Gmail accounts work out of the box:

```bash
kaiwu connect gemini
kaiwu gemini
```

### Google Workspace Account

Google Workspace (organization) accounts require a Google Cloud Project:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gemini API
3. Set the project ID:

```bash
kaiwu gemini project set your-project-id
```

Or use environment variable:
```bash
GOOGLE_CLOUD_PROJECT=your-project-id kaiwu gemini
```

**Guide:** https://goo.gle/gemini-cli-auth-docs#workspace-gca

## Contributing

Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Requirements

- Node.js >= 20.0.0

### For Claude

- Claude CLI installed & logged in (`claude` command available in PATH)

### For Gemini

- Gemini CLI installed (`gemini` command available in PATH or installed via Kaiwu provider settings)
- Google account authenticated via `kaiwu connect gemini`

## License

MIT
