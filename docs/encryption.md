# Encryption and Data Encoding

This document details how client data is encrypted, how encrypted blobs are structured, and how those blobs map onto protocol fields. It is based on `apps/cli/src/api/encryption.ts` and the server routes that accept/emit these values.

For transport and event shapes, see `protocol.md`. For HTTP endpoints, see `api.md`.

## Overview

```mermaid
graph TB
    subgraph "Client (CLI/Mobile)"
        Plain[Plaintext Data]
        ClientEnc[Client Encryption]
        B64[Base64 Encoded]
    end

    subgraph "Transport"
        Wire[HTTP / WebSocket]
    end

    subgraph "Server"
        Store[(Postgres)]
        ServerEnc[Server Encryption]
        Tokens[Service Tokens]
    end

    Plain --> ClientEnc --> B64 --> Wire --> Store
    Tokens --> ServerEnc --> Store

    style Plain fill:#e8f5e9
    style B64 fill:#fff3e0
    style Store fill:#e3f2fd
```

## Design goals
- Keep the server blind to user content (end-to-end encryption on clients).
- Use explicit, stable binary layouts so clients can interoperate across versions.
- Prefer simple, consistent base64 encoding on the wire.

## Encryption variants

```mermaid
graph LR
    subgraph "Variant Selection"
        Check{Has dataKey?}
        Check --> |No| Legacy[Legacy NaCl]
        Check --> |Yes| DataKey[DataKey AES-GCM]
    end

    subgraph "Legacy"
        L1[XSalsa20-Poly1305]
        L2[32-byte shared secret]
    end

    subgraph "DataKey"
        D1[AES-256-GCM]
        D2[Per-session/machine key]
    end

    Legacy --> L1 & L2
    DataKey --> D1 & D2
```

Clients currently use one of two encryption variants:

### 1) legacy (NaCl secretbox)
Used when the client only has a shared secret key.

**Algorithm**: `tweetnacl.secretbox` (XSalsa20-Poly1305)
- **Nonce length**: 24 bytes
- **Key length**: 32 bytes

**Binary layout** (plaintext JSON -> bytes):
```
[ nonce (24) | ciphertext+auth (secretbox output) ]
```

```mermaid
packet-beta
  0-23: "nonce (24 bytes)"
  24-55: "ciphertext + auth tag"
```

### 2) dataKey (AES-256-GCM)
Used when the client supports per-session/per-machine data keys.

**Algorithm**: AES-256-GCM
- **Nonce length**: 12 bytes
- **Auth tag**: 16 bytes
- **Key length**: 32 bytes

**Binary layout**:
```
[ version (1) | nonce (12) | ciphertext (...) | authTag (16) ]
```

```mermaid
packet-beta
  0-0: "ver"
  1-12: "nonce (12 bytes)"
  13-44: "ciphertext (...)"
  45-60: "authTag (16 bytes)"
```

- `version` is currently `0`.

## Data encryption key (dataKey variant)

```mermaid
flowchart LR
    subgraph "Key Wrapping"
        DEK[Data Encryption Key]
        Eph[Ephemeral Keypair]
        Box[tweetnacl.box]
        Bundle[Key Bundle]
    end

    DEK --> Box
    Eph --> Box
    Box --> Bundle

    subgraph "Content Encryption"
        Plain[Plaintext]
        AES[AES-256-GCM]
        Cipher[Ciphertext]
    end

    DEK --> AES
    Plain --> AES --> Cipher
```

When `dataKey` is used, the actual content key is encrypted for storage/transport.

**Algorithm**: `tweetnacl.box` with an ephemeral keypair.
- **Ephemeral public key**: 32 bytes
- **Nonce**: 24 bytes

**Binary layout**:
```
[ ephPublicKey (32) | nonce (24) | ciphertext (...) ]
```

```mermaid
packet-beta
  0-31: "ephPublicKey (32 bytes)"
  32-55: "nonce (24 bytes)"
  56-87: "ciphertext (...)"
```

This blob is then wrapped with a version byte before being sent/stored:
```
[ version (1 = 0) | boxBundle (...) ]
```

The resulting bytes are base64-encoded and placed in fields such as `dataEncryptionKey` for sessions/machines/artifacts.

## Where encryption is applied

```mermaid
graph TB
    subgraph "Client-Encrypted Fields"
        direction TB
        S1[Session metadata]
        S2[Session agent state]
        S3[Session messages]
        M1[Machine metadata]
        M2[Daemon state]
        A1[Artifact header]
        A2[Artifact body]
        K1[KV store values]
        AK[Access keys]
    end

    subgraph "Server Storage"
        DB[(Postgres)]
    end

    S1 & S2 & S3 --> |opaque strings| DB
    M1 & M2 --> |opaque strings| DB
    A1 & A2 --> |opaque bytes| DB
    K1 --> |opaque bytes| DB
    AK --> |opaque string| DB

    style S1 fill:#e1f5fe
    style S2 fill:#e1f5fe
    style S3 fill:#e1f5fe
    style M1 fill:#e1f5fe
    style M2 fill:#e1f5fe
    style A1 fill:#e1f5fe
    style A2 fill:#e1f5fe
    style K1 fill:#e1f5fe
    style AK fill:#e1f5fe
```

The server treats these fields as opaque strings/blobs. The client encrypts them before sending.

### Session metadata + agent state
- **Encrypted by client** and stored as strings in the DB.
- Used in:
  - `POST /v1/sessions` (create/load)
  - WebSocket `update-metadata` / `update-state`
  - `update-session` events

### Session messages

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant DB as Postgres

    Client->>Client: Encrypt message
    Client->>Server: emit "message" { sid, message: "<base64>" }
    Server->>DB: Store { t: "encrypted", c: "<base64>" }

    Note over Server: Later, sync to other clients

    Server->>Client: update "new-message"<br/>content: { t: "encrypted", c: "<base64>" }
    Client->>Client: Decrypt message
```

- Client emits `message` with a base64 encrypted blob.
- Server stores it as `SessionMessage.content`:
  - `{ t: "encrypted", c: "<base64>" }`
- Server emits it back in `new-message` updates with the same structure.

### Machine metadata + daemon state
- **Encrypted by client** and stored as strings in the DB.
- Used in:
  - `POST /v1/machines`
  - WebSocket `machine-update-metadata` / `machine-update-state`
  - `update-machine` events

### Artifacts
- `header` and `body` are encrypted bytes encoded as base64 on the wire.
- Stored as `Bytes` in the DB.
- Emitted in `new-artifact` / `update-artifact` events as base64 strings.

### Access keys
- `AccessKey.data` is treated as an **opaque encrypted string**.
- The server does not decode it or inspect its contents.

### Key-value store
- `UserKVStore.value` is encrypted bytes encoded as base64 on the wire.
- `kvMutate` expects base64 strings; `kvGet/list/bulk` return base64 strings.

Session drafts reserve a typed `UserKVStore` key prefix instead of exposing their rows through the
generic KV API. The draft routes carry an explicit content envelope and enforce its owner:

- a new-Session draft follows the Account encryption mode and uses Account-scoped key material;
- an existing-Session draft follows that Session's fixed encryption mode and, in E2EE mode, uses
  the Session data-encryption key;
- raw attachment bytes, local file handles and URIs, credentials, secret values, and local
  presentation state are not part of synchronized draft content.

This keeps one draft document and synchronization contract without weakening the different key
ownership of Account-scoped and Session-scoped data.

Snapshot hydration distinguishes a temporarily unavailable existing-Session key/context from an
invalid envelope or payload. It may skip only the unavailable Session record while continuing to
materialize other Account drafts; malformed or mode-incompatible content fails the snapshot so it
cannot be silently classified as a local key-loading condition.

## On-wire formats (encrypted fields)

```mermaid
graph LR
    subgraph "Wire Format"
        JSON[JSON payload]
        B64["base64 strings<br/>(encrypted bytes)"]
        Plain["plain values<br/>(ids, versions, timestamps)"]
    end

    JSON --> B64
    JSON --> Plain
```

Below are the typical JSON shapes that carry encrypted data. All `...` values are base64 strings representing encrypted bytes.

### Session creation
```http
POST /v1/sessions
```
```json
{
  "tag": "<string>",
  "metadata": "<base64 encrypted>",
  "agentState": "<base64 encrypted or null>",
  "dataEncryptionKey": "<base64 data key bundle or null>"
}
```

### Encrypted message (client -> server)
```
Socket emit: "message"
```
```json
{
  "sid": "<session id>",
  "message": "<base64 encrypted>"
}
```

### Encrypted message (server -> client)
```
update.body.t = "new-message"
```
```json
{
  "t": "encrypted",
  "c": "<base64 encrypted>"
}
```

### Session metadata update (WebSocket)
```
Socket emit: "update-metadata"
```
```json
{
  "sid": "<session id>",
  "metadata": "<base64 encrypted>",
  "expectedVersion": 3
}
```

### Machine update (WebSocket)
```
Socket emit: "machine-update-state"
```
```json
{
  "machineId": "<machine id>",
  "daemonState": "<base64 encrypted>",
  "expectedVersion": 2
}
```

### Artifact create/update (HTTP)
```http
POST /v1/artifacts
```
```json
{
  "id": "<uuid>",
  "header": "<base64 encrypted>",
  "body": "<base64 encrypted>",
  "dataEncryptionKey": "<base64 data key bundle>"
}
```

### KV mutate (HTTP)
```http
POST /v1/kv
```
```json
{
  "mutations": [
    { "key": "prefs.theme", "value": "<base64 encrypted>", "version": 2 },
    { "key": "prefs.legacy", "value": null, "version": 5 }
  ]
}
```

## Client-side types (shapes used before encryption)
These are the client-side structures that get encrypted and sent over the wire. They are defined in `apps/cli/src/api/types.ts`.

### Session message content (encrypted)
The payload stored in `SessionMessage.content` is always encrypted and wrapped as:
```json
{ "t": "encrypted", "c": "<base64 encrypted>" }
```

### Encrypted message payload (plaintext before encryption)
Messages are encrypted as `MessageContent` and then base64 encoded:

**User message**
```json
{
  "role": "user",
  "content": { "type": "text", "text": "..." },
  "localKey": "...",
  "meta": { }
}
```

**Agent message**
```json
{
  "role": "agent",
  "content": { "type": "output | codex | acp | event", "data": "..." },
  "meta": { }
}
```

### Metadata (encrypted)
```json
{
  "path": "...",
  "host": "...",
  "homeDir": "...",
  "happyHomeDir": "...",
  "happyLibDir": "...",
  "happyToolsDir": "...",
  "version": "...",
  "name": "...",
  "os": "...",
  "summary": { "text": "...", "updatedAt": 123 },
  "machineId": "...",
  "claudeSessionId": "...",
  "tools": ["..."],
  "slashCommands": ["..."],
  "startedFromDaemon": true,
  "hostPid": 12345,
  "startedBy": "daemon | terminal",
  "lifecycleState": "running | archiveRequested | archived",
  "lifecycleStateSince": 123,
  "archivedBy": "...",
  "archiveReason": "...",
  "flavor": "..."
}
```

### Agent state (encrypted)
```json
{
  "controlledByUser": true,
  "requests": {
    "<id>": { "tool": "...", "arguments": {}, "createdAt": 123 }
  },
  "completedRequests": {
    "<id>": {
      "tool": "...",
      "arguments": {},
      "createdAt": 123,
      "completedAt": 123,
      "status": "canceled | denied | approved",
      "reason": "...",
      "mode": "default | acceptEdits | bypassPermissions | plan | read-only | safe-yolo | yolo",
      "decision": "approved | approved_for_session | denied | abort",
      "allowTools": ["..."]
    }
  }
}
```

### Machine metadata (encrypted)
```json
{
  "host": "...",
  "platform": "...",
  "happyCliVersion": "...",
  "homeDir": "...",
  "happyHomeDir": "...",
  "happyLibDir": "..."
}
```

### Daemon state (encrypted)
```json
{
  "status": "running | shutting-down",
  "pid": 123,
  "httpPort": 123,
  "startedAt": 123,
  "shutdownRequestedAt": 123,
  "shutdownSource": "mobile-app | cli | os-signal | unknown"
}
```

## Decryption flow (client side)

```mermaid
flowchart TD
    Start([Receive encrypted field]) --> B64[Decode base64 to bytes]
    B64 --> Check{Has dataKey?}

    Check --> |No| Legacy[Use legacy variant]
    Check --> |Yes| DataKey[Use dataKey variant]

    subgraph "Legacy Path"
        Legacy --> ExtractL[Extract nonce + ciphertext]
        ExtractL --> DecryptL[secretbox.open with shared key]
    end

    subgraph "DataKey Path"
        DataKey --> GetDEK[Decrypt dataEncryptionKey bundle]
        GetDEK --> ExtractD[Extract version + nonce + ciphertext + tag]
        ExtractD --> DecryptD[AES-GCM decrypt with DEK]
    end

    DecryptL --> Plain([Plaintext JSON])
    DecryptD --> Plain
```

- Read base64 field from API/Socket.
- Decode base64 to bytes.
- Choose encryption variant (`legacy` or `dataKey`) based on local credentials.
- Decrypt bytes using the appropriate key and algorithm.

For `dataKey`, clients must first decrypt or derive the per-session/per-machine data key from the stored `dataEncryptionKey` bundle.

## Client-side caches of decrypted content

The app keeps two derived, refreshable projections of decrypted content on the device so screens can paint before the network answers. Neither is an authority: the server is, and both are reconciled against it on every use.

| Cache | Owner | Holds | Native (iOS/Android) | Web / Tauri |
|---|---|---|---|---|
| Warm cache | `apps/ui/sources/sync/domains/state/warmCachePersistence.ts` | Session-list rows, machine displays, session organization | MMKV instance `warm-cache-v2`, encrypted | `localStorage`-backed MMKV web store, plaintext |
| Transcript cache | `apps/ui/sources/sync/domains/state/transcriptCachePersistence.ts` | Transcript tail of recently opened sessions + the session's server row | MMKV instance `transcript-cache-v1`, encrypted | IndexedDB database `kaiwu-transcript-cache`, plaintext |

**At-rest key (native).** Both MMKV instances are encrypted with one key generated from the platform CSPRNG and held in the OS keystore (`warmCacheEncryptionKey.ts`, Keychain / Android Keystore). If the keystore cannot produce the key, nothing is written or read — the app cold-starts from the network rather than persisting plaintext. MMKV uses only the first 16 bytes of the key (AES-128-CFB).

**Web is plaintext deliberately.** On web the API token and the E2EE secret already live in `localStorage`, so anyone who can read these caches can already decrypt the whole account; encrypting them would add no exposure class. Revisit together with web credential storage. Transcripts use IndexedDB rather than `localStorage` because `localStorage` is a ~5 MB per-origin budget shared with the credential.

### Transcript cache contract

- **What is stored.** Per session: the newest contiguous window of main-chain messages that carry a server `seq` (as replayable `NormalizedMessage`s plus each row's server `updatedAt`), the window bounds (`maxSeq` = materialized head, `minSeq`, `hasMoreOlder`) and the server's `V2SessionRecord` row for the session — still ciphertext, including the wrapped `dataEncryptionKey`. Optimistic, streaming and synthetic rows are never stored; their owners re-derive them.
- **Scope.** Records are keyed by `serverId:accountId:sessionId` and only read under the active server and signed-in account. Sessions owned by another server and direct sessions are never written.
- **Bounds.** Newest `sessionMessagesPageSize` (150) messages per session, at most 512 KiB per record (older messages are dropped from the old end so the window stays contiguous with `maxSeq`), at most 30 sessions and 8 MiB in total, evicted least-recently-used. The total is chosen because an encrypted MMKV instance is decrypted into memory in full on first open.
- **Read path.** Opening a session whose transcript is not in memory (cold start, or after bounded in-memory retention evicted it) replays the session row through the session-by-id decoder (if the store has no session yet) and the messages through `applyMessages`, restores the older-page cursor and sets the materialized head to the record's `maxSeq`. The normal catch-up then fetches only `afterSeq=maxSeq`; a large gap falls through to the existing tail-reset path. The live `/v2/sessions/:id` fetch still runs and replaces the shell.
- **Bytes-first fetch policy.** Message transfer is sized to what is missing, never to time offline: with a cached or in-memory transcript, reopen, reconnect and resume page only `afterSeq` from the materialized head (a gap of `messageLargeGapSeq` = 500 or more falls back to one latest page plus the older walk on scroll-up). A first open with nothing local fetches one screenful (`apps/ui/sources/sync/runtime/initialTranscriptPageSize.ts`: `ceil(viewportHeight / 40 dp) × 2` on native, 12 on web) instead of the 150-message configured page. Long offline periods no longer force a changes-feed snapshot refresh (which refetched the session list and invalidated every persisted transcript); the changes feed degrades to a snapshot only on `cursor-gone` or page-budget exhaustion. After a socket outage the full session list is refetched only when a session is live, because presence is ephemeral only for live sessions — going live or ending is a durable, cursor-backed lifecycle change.
- **Background refresh (native, runtime `kaiwu-2-native`+).** `apps/ui/sources/sync/background/backgroundSessionRefresh.ts` keeps the five most recently used cached transcripts current while the app is not in the foreground, through two OS entry points sharing one body: a periodic `expo-background-task` (iOS BGTaskScheduler processing task, Android WorkManager, 15-minute floor, OS-scheduled) and a push wake (the CLI sets iOS `content-available` on every activity push; on Android every Expo push is an FCM data message, so `expo-notifications` runs the task). The push's visible alert is unchanged and nothing is presented by the task. The wake carries only identifiers (`sessionId`, `serverUrl`); content is fetched end-to-end encrypted through the same `afterSeq` pipeline and persisted before the task returns, inside a 25 s budget. A push from another server is ignored. Older clients ignore `content-available` (no task registered).
- **Write path.** Every applied message is observed at `Sync.applyMessages`; a session is written after a 3 s quiet period (so streaming never competes with serialization), and immediately on eviction, app backgrounding and server/account switches.
- **Invalidation.** A record is deleted when: the server reports a durable edit (`updatedMessageSeq` change hint) for a session not held in memory; a realtime edit marks the in-memory transcript stale (it is rewritten after the targeted repair); a changes-feed snapshot fallback runs (every record except sessions held in memory); the session is deleted or its share revoked; the record fails validation. Sign-out clears the whole store after the server scope is torn down.
- **Versioning.** `TRANSCRIPT_CACHE_SCHEMA_VERSION` must be bumped whenever the record shape or the replayed `NormalizedMessage` shape changes incompatibly; older records then fail validation and are deleted on first read, costing one network fetch.
- **Failure signals.** Storage failures, invalid records and replay failures are recorded as `sync.transcriptCache.*` sync-reliability events.

## Server-side encryption (service tokens)

```mermaid
graph LR
    subgraph "Third-Party Tokens"
        GH[GitHub OAuth]
        OAI[OpenAI]
        ANT[Anthropic]
        GEM[Gemini]
    end

    subgraph "Server"
        Secret[HANDY_MASTER_SECRET]
        KeyTree[KeyTree]
        Encrypt[Encrypt]
    end

    DB[(Postgres)]

    Secret --> KeyTree --> Encrypt
    GH & OAI & ANT & GEM --> Encrypt --> DB

    style GH fill:#fff3e0
    style OAI fill:#fff3e0
    style ANT fill:#fff3e0
    style GEM fill:#fff3e0
```

The server encrypts certain third-party tokens at rest:
- GitHub OAuth tokens (`GithubUser.token`).
- Vendor service tokens (`ServiceAccountToken.token`).

These are encrypted with a server-only KeyTree derived from `HANDY_MASTER_SECRET` and are not end-to-end encrypted.

## Encoding conventions

```mermaid
graph TB
    subgraph "Encoding Rules"
        E1["Encrypted bytes → base64 string"]
        E2["Timestamps → plain number (epoch ms)"]
        E3["IDs, tags, versions → plain string/number"]
    end

    subgraph "Examples"
        Ex1["metadata: 'SGVsbG8gV29ybGQ='"]
        Ex2["createdAt: 1704067200000"]
        Ex3["id: 'abc-123', version: 5"]
    end

    E1 --> Ex1
    E2 --> Ex2
    E3 --> Ex3
```

- All encrypted bytes are base64 strings on the wire unless explicitly noted.
- Timestamps remain plain numbers (epoch ms) and are not encrypted by the server.
- Non-encrypted identifiers (ids, tags, versions) are always plain strings/numbers.

## Session storage modes

Sessions can store transcript content in encrypted-at-rest or plaintext-at-rest mode. This is a storage mode, not a transport-security or authentication mode.

Canonical concepts:

- **Server storage policy:** `required_e2ee | optional | plaintext_only`, surfaced through `/v1/features`.
- **Account encryption mode:** `e2ee | plain`, used as the default for new sessions.
- **Session encryption mode:** `e2ee | plain`, fixed at session creation so a transcript does not mix modes.
- **Client encryption requirement:** `follow_account | require_e2ee`, resolved strongest-wins from the synced Account preference, a UI device-local pin, and the daemon's `HAPPIER_ENCRYPTION_REQUIREMENT` override.
- **Content envelope:**
  - encrypted content: `{ t: 'encrypted', c: string }`
  - plaintext content: `{ t: 'plain', v: unknown }`

Write paths must enforce mode/content-kind compatibility:

- `e2ee` sessions accept encrypted content only.
- `plain` sessions accept plain content only.

Clients must parse the envelope and branch explicitly. Do not guess that content is encrypted.

`require_e2ee` is enforced at the Account-settings and Session-content choke points. A client must reject a plaintext Account envelope before publishing it, reject plaintext session creation or a create-or-load response, and avoid opening or authoring plaintext Session content. The UI device-local pin remains scoped with the existing server/account settings persistence; the synced preference reaches a daemon through the existing Account-settings snapshot and pre-spawn minimum-version hint. No relay API or separate UI-to-daemon policy field owns this decision.

Missing client-requirement fields preserve the released behavior (`follow_account`). The daemon environment override can only strengthen the effective requirement; invalid non-empty values fail startup.

Sharing rules:

- Plain sessions can share without `encryptedDataKey` because access is server-managed.
- E2EE sessions and public shares require a valid encrypted data-key envelope.

Feature gates:

- `encryption.plaintextStorage`
- `encryption.accountOptOut`

Do not gate plaintext behavior on raw env vars or `capabilities` fields.

When Account encryption mode changes, every active new-Session draft participates in the same
atomic mode transition as the other Account-scoped encrypted records. Existing-Session drafts do
not participate: their envelope remains bound to the owning Session. A missing or incomplete draft
census, a revision mismatch, or a wrong envelope kind aborts the Account transition without
partially changing the mode.

## Terminal pairing authentication rollout

Terminal pairing v3 adds a 32-byte secret to the QR/deep link and authenticates the sealed
content-key response with HMAC-SHA-256. The terminal keeps that secret local and does not include it
in the relay auth request.

The current rollout is an **expansion phase**: new native clients produce v3 responses, while the
terminal still accepts legacy v1/v2 responses for compatibility. Until a later release activates
v3 enforcement, a malicious relay can still downgrade the exchange to a forged legacy response.

Users who want to opt into enforcement during the expansion phase can require the current
authenticated protocol locally:

```bash
HAPPIER_TERMINAL_PAIRING_REQUIRE=v3 kaiwu auth login
```

`v3` is a minimum accepted pairing-protocol requirement: legacy v1/v2 responses are rejected, and
future supported versions may satisfy the same or a stronger requirement. Unknown values fail
closed with a configuration error. For `auth request --json` plus `auth wait`, the requirement is
persisted in the private pending-auth state so the wait process cannot accidentally lose it.

Native-app QR pairing can provide relay-independent authentication once enforcement is active
because the secret travels camera-to-app. Web pairing cannot make the same guarantee against a
hostile self-hosted relay: that relay also serves the JavaScript which receives the secret, so the
web flow necessarily trusts its web origin.

## Implementation references
- Client crypto: `apps/cli/src/api/encryption.ts`
- Session message format: `apps/cli/src/api/types.ts`
- Server message ingestion: `apps/server/sources/app/api/socket/sessionUpdateHandler.ts`
- Artifact/KV routes: `apps/server/sources/app/api/routes/artifactsRoutes.ts`, `apps/server/sources/app/kv/kvMutate.ts`
