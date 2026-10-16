# bug-report-relay

开物问题报告的自建接收端，服务端特性 `capabilities.bugReports.providerUrl` 指向它（官方中继为 `https://kaiwu.wujilabs.cn/bug-reports`）。报告与诊断附件只存于运维服务器，不发往任何外部服务。

- 接口：`POST /v1/reports/session` → `PUT` 签名上传地址 → `POST /v1/reports/submit`；`GET /v1/issues/similar`；`GET /v1/reports/:id`（只显示「已收到」）；`GET /healthz`。协议见 `packages/protocol/src/bugReports/submit.ts`。
- 存储：`DATA_DIR/reports/<reportId>/`（`meta.json` + `artifacts/`），默认保留 90 天；工单号计数在 `DATA_DIR/ticket-counter`。
- 通知：提交后向 `WECOM_WEBHOOK_URL` 推送摘要（不含附件内容）。
- 公开 Issue：仅当配置 `GITHUB_TOKEN`（建议细粒度令牌，只授权 `ISSUE_OWNER/ISSUE_REPO` 的 Issues 写权限）时，用表单文字创建 Issue 或评论，诊断附件与服务器地址从不公开；仓库由服务端固定，客户端传来的 owner/repo 一律忽略。
- 防滥用：附件上传地址带 HMAC 签名（`UPLOAD_SECRET`），声明大小与 `MAX_ARTIFACT_BYTES` 双重上限，每 IP 每小时 `SESSIONS_PER_HOUR_PER_IP` 个会话。

运行：零依赖，`node server.mjs`；测试：`node --test apps/bug-report-relay/server.test.mjs`（需先构建 `packages/protocol`，测试直接用客户端真实提交代码打接收端）。
