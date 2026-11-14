# 缺陷登记 · Continuation 风暴：上游 503 时自动续跑无熔断（710 次实证）

- **日期**：2026-11-14 晚
- **现象**：上游网关（cc-switch → CPA / Gemini模型组）全池 503 时，`happier_cli` 驱动的 codex 会话无限循环发 `GENERIC_CONTINUATION_RESUME_PROMPT`（"Continue where you left off"）：失败 → 续跑 → 又失败 → 又续跑。实测单会话 710 次（357 个上游 503），跨会话合计 1300+ 次，持续数小时不能自停，用户侧表现为「疯狂发 Continue where you left off 停不下来」。
- **证据**：
  - 会话 `~/.codex/sessions/2026/11/14/rollout-2026-11-14T19-16-20-*.jsonl`：710 次 resume prompt / 357 次 `503 Service Unavailable: CC Switch local proxy failed ... Provider: CPA / Gemini模型组`；
  - 会话 `rollout-2026-11-14T00-50-48-*.jsonl`：656 次。
- **定位**：`apps/cli/src/daemon/connectedServices/continuation/` 的续跑链路（`createConnectedServiceContinuationMessageDispatcher.ts` 等）对「turn 因上游 5xx 中断」的处理是无条件 resume；`continuationResumePrompt.ts` 的两个 resume prompt（usage-limit 版与 generic 版）在**持续性基础设施故障**（非 usage limit）下没有失败次数预算、退避或终止条件。
- **期望行为**（修复验收线）：
  1. 同一会话连续 N 次（建议默认 5）续跑后 turn 仍以同类上游错误结束时，停止续跑、向用户界面报告「上游不可用，已暂停续跑」，保留会话状态待手动恢复；
  2. 连续失败须指数退避（首次立即，其后 30s/2m/10m 量级），防止风控类上游（如 Google TOS）被续跑流量二次踩踏；
  3. usage-limit 型 resume（额度恢复）与 infra-fault 型 resume 分开计数、分开策略——前者可等待重试，后者必须熔断。
- **关联**：母仓 `docs/capabilities/ai-infra/cpa-gateway-runbook.md` 第十七节（当晚止血实案：座位切回 cpa-codex 档后风暴收敛，会话以 `task_complete` 正常收尾）。
- **状态**：已止血（档位切换），未修复（开物侧代码未动）。
