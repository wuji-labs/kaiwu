---
name: kaiwu-session-control
description: Manage Kaiwu / Kaiwu sessions (list/status/send/wait/history/stop + execution runs) via the kaiwu/happier CLI JSON contract.
metadata: {"openclaw":{"requires":{"bins":["kaiwu","kaiwu"]},"homepage":"https://github.com/wuji-labs/kaiwu"}}
---

# Kaiwu / Kaiwu Session Control (CLI JSON)

This skill enables an agent framework (for example OpenClaw) to control Kaiwu / Kaiwu sessions using the CLI (`kaiwu` or `kaiwu`) in `--json` mode.

## Prerequisites

- The `kaiwu` (or `kaiwu`) CLI is installed and authenticated.
- If using multiple servers/profiles, pass server selection flags **before** `session` (prefix-only):
  - `kaiwu --server <profile-id-or-name> session list --json`
  - `kaiwu --server-url <url> --webapp-url <url> session list --json`

## Contract

All JSON outputs are a pure-stdout envelope:

```json
{ "v": 1, "ok": true, "kind": "...", "data": {} }
```

or:

```json
{ "v": 1, "ok": false, "kind": "...", "error": { "code": "..." } }
```

Common error codes to handle:

- `not_authenticated`: run `kaiwu auth login` on the host (or mount/provide a valid `HAPPIER_HOME_DIR`).
- `session_id_ambiguous`: pick deterministically from `error.candidates` (prefer exact id; otherwise ask the user).
- `session_not_found`: call `kaiwu session list --json` and retry.
- `unsupported`: feature disabled by server policy or backend doesn’t support the requested intent.

## Auth Commands (JSON)

Check auth status without scraping human output:

```bash
kaiwu auth status --json
```

## Session Commands

List sessions:

```bash
kaiwu session list --json
```

Inspect session status (server snapshot):

```bash
kaiwu session status <session-id-or-prefix> --json
```

Inspect session status with a best-effort live refresh:

```bash
kaiwu session status <session-id-or-prefix> --live --json
```

Create/load a session by tag:

```bash
kaiwu session create --tag <tag> --json
```

Send a message to a session:

```bash
kaiwu session send <session-id-or-prefix> "<message>" --json
```

Send a message and wait until the session is idle:

```bash
kaiwu session send <session-id-or-prefix> "<message>" --wait --timeout 300 --json
```

Wait for a session to become idle:

```bash
kaiwu session wait <session-id-or-prefix> --timeout 300 --json
```

Stop a session:

```bash
kaiwu session stop <session-id-or-prefix> --json
```

Read session history (compact is recommended for prompt stuffing):

```bash
kaiwu session history <session-id-or-prefix> --limit 50 --format compact --json
```

## Execution Run Commands

Start an execution run:

```bash
kaiwu session run start <session-id-or-prefix> --intent review --backend claude --json
```

List runs for a session:

```bash
kaiwu session run list <session-id-or-prefix> --json
```

Get a run:

```bash
kaiwu session run get <session-id-or-prefix> <run-id> --include-structured --json
```

Send input to a run:

```bash
kaiwu session run send <session-id-or-prefix> <run-id> "<message>" --json
```

Stop a run:

```bash
kaiwu session run stop <session-id-or-prefix> <run-id> --json
```

Execute an action on a run:

```bash
kaiwu session run action <session-id-or-prefix> <run-id> <action-id> --input-json '<json>' --json
```

Wait for a run to finish:

```bash
kaiwu session run wait <session-id-or-prefix> <run-id> --timeout 300 --json
```

Stream turn IO for a streaming run (e.g. `intent=voice_agent`):

```bash
kaiwu session run stream-start <session-id-or-prefix> <run-id> "<message>" --json
kaiwu session run stream-read <session-id-or-prefix> <run-id> <stream-id> --cursor 0 --json
kaiwu session run stream-cancel <session-id-or-prefix> <run-id> <stream-id> --json
```

## Server Commands (JSON)

List server profiles:

```bash
kaiwu server list --json
```

Current active server:

```bash
kaiwu server current --json
```

Add a server profile non-interactively:

```bash
kaiwu server add --name "My Server" --server-url https://example.com --webapp-url https://example.com --use --json
```

Switch active server:

```bash
kaiwu server use <id-or-name> --json
```

Remove a server profile:

```bash
kaiwu server remove <id-or-name> --force --json
```

Probe server reachability/version:

```bash
kaiwu server test [<id-or-name>] --json
```

Set a one-off custom server as active:

```bash
kaiwu server set --server-url https://example.com --webapp-url https://example.com --json
```

