import { compactHomePath } from '@/ui/format/styles';
import type { AccountSettings } from '@happier-dev/protocol';

import type { Credentials } from '@/persistence';
import type { CliSessionRowModel } from '@/cli/output/session/buildCliSessionRowModel';
import { buildCliSessionRowModel } from '@/cli/output/session/buildCliSessionRowModel';
import type { RawSessionListRow } from '@/session/transport/http/sessionsHttp';
import type { SessionActionSelectorRow } from '@/ui/ink/SessionActionSelector';

/**
 * Sister to `attachInteractiveSelection.ts`, scoped tightly to the resume
 * flow per the reviewer's correction:
 *
 * - Resume is for *stopped, non-system* sessions that vendor-resume can
 *   pick up. We surface stopped non-resumable sessions as disabled-with-
 *   reason rows (same idiom as attach), instead of collapsing every
 *   ineligible row into "No resumable sessions found".
 * - Active sessions don't belong in this list at all — they're attachable
 *   territory. Instead of mixing them in, we surface them as a footer
 *   summary ("N session(s) running; use kaiwu attach") so the user
 *   doesn't lose track of them.
 *
 * The split keeps each command's selector focused on one mental model
 * (attach=running, resume=stopped) while still using the same selector
 * primitive and the same disabled-with-reason rendering.
 */

type FetchSessionsPageFn = (params: {
  token: string;
  cursor?: string;
  limit?: number;
  activeOnly?: boolean;
  archivedOnly?: boolean;
}) => Promise<{
  sessions: RawSessionListRow[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

export type ResumeIneligibilityCategory =
  | 'archived'
  | 'still_active'                // not used in selector (hidden via "stopped only"), but kept for the footer math
  | 'vendor_resume_not_supported' // agent has no vendor resume capability
  | 'vendor_resume_id_missing'    // metadata is incomplete
  | 'experimental_disabled'        // backend gated by account settings
  | 'path_unknown'                // cannot chdir on resume
  | 'system_session'              // system sessions shouldn't be resumed
  | 'unknown';

export type ResumeSelectionFooterHint = Readonly<{
  /** N stopped sessions exist but cannot be resumed. */
  ineligibleCount: number;
  resumableCount: number;
  /** N sessions are currently running and should be attached, not resumed. */
  activeRunningCount: number;
}>;

export type ResumeSelectionModel = Readonly<{
  rows: SessionActionSelectorRow[];
  hint: ResumeSelectionFooterHint;
}>;

function classifyResumeIneligibility(rowModel: CliSessionRowModel): ResumeIneligibilityCategory {
  if (rowModel.archivedAt !== null) return 'archived';
  if (rowModel.active === true) return 'still_active';
  if (rowModel.isSystem) return 'system_session';
  if (!rowModel.path) return 'path_unknown';
  if (rowModel.vendorResume.eligible) return 'unknown'; // shouldn't be called for eligible rows
  switch (rowModel.vendorResume.reasonCode) {
    case 'agent_unsupported':
      return 'vendor_resume_not_supported';
    case 'vendor_resume_id_missing':
      return 'vendor_resume_id_missing';
    case 'experimental_disabled':
    case 'backend_disabled_by_account_settings':
      return 'experimental_disabled';
    default:
      return 'unknown';
  }
}

function shortReasonForResume(category: ResumeIneligibilityCategory): string {
  switch (category) {
    case 'archived':
      return '已归档';
    case 'still_active':
      return '当前正在运行 — 请使用 kaiwu attach';
    case 'vendor_resume_not_supported':
      return '此 Agent 不支持恢复';
    case 'vendor_resume_id_missing':
      return '元数据中缺少厂商恢复 ID';
    case 'experimental_disabled':
      return '恢复功能已在账号设置中禁用';
    case 'path_unknown':
      return '会话未记录工作目录';
    case 'system_session':
      return '内部系统会话';
    default:
      return '无法恢复';
  }
}

function fullReasonForResume(category: ResumeIneligibilityCategory): string {
  switch (category) {
    case 'archived':
      return '此会话已归档，无法恢复。';
    case 'still_active':
      return '此会话当前正在运行。请改用 `kaiwu attach` 接入终端。';
    case 'vendor_resume_not_supported':
      return '此会话的 Agent 不支持从 CLI 恢复。';
    case 'vendor_resume_id_missing':
      return '此会话的元数据中缺少厂商恢复 ID。';
    case 'experimental_disabled':
      return '恢复功能已在您的账号设置中禁用（会话 → 恢复）。';
    case 'path_unknown':
      return '此会话未记录工作目录；CLI 恢复需要工作目录。';
    case 'system_session':
      return '这是内部系统会话，无法恢复。';
    default:
      return '此会话无法从此 CLI 恢复。';
  }
}

export async function buildResumeSelectionModel(params: Readonly<{
  credentials: Credentials;
  accountSettings: AccountSettings;
  fetchSessionsPageFn: FetchSessionsPageFn;
}>): Promise<ResumeSelectionModel> {
  const page = await params.fetchSessionsPageFn({ token: params.credentials.token, limit: 200 });
  const rows: SessionActionSelectorRow[] = [];
  let activeRunningCount = 0;
  let ineligibleCount = 0;
  let resumableCount = 0;

  for (const rawSession of page.sessions) {
    const rowModel = buildCliSessionRowModel({
      credentials: params.credentials,
      rawSession,
      accountSettings: params.accountSettings,
    });
    if (rowModel.isSystem) continue;
    if (rowModel.archivedAt !== null) continue;        // archives are out of scope here
    if (rowModel.active === true) {
      // Surface active sessions only as a footer count — they belong to
      // `kaiwu attach`, not `kaiwu resume`. Showing them mixed in
      // would muddle resume's mental model (stopped sessions only).
      activeRunningCount += 1;
      continue;
    }
    if (!rowModel.path) {
      // No path means we can't chdir on resume; show disabled.
    }

    const baseRow: SessionActionSelectorRow = {
      sessionId: rowModel.id,
      agentId: rowModel.agentId,
      updatedAt: rowModel.updatedAt,
      title: [rowModel.tag, rowModel.title].filter((value) => typeof value === 'string' && value.trim().length > 0).join(' · '),
      path: compactHomePath(rowModel.path) || rowModel.path || '',
      annotation: null,
      probeable: false,
      disabled: false,
      disabledReason: null,
    };

    if (rowModel.vendorResume.eligible && rowModel.path) {
      rows.push(baseRow);
      resumableCount += 1;
    } else {
      const category = classifyResumeIneligibility(rowModel);
      ineligibleCount += 1;
      rows.push({
        ...baseRow,
        annotation: shortReasonForResume(category),
        disabled: true,
        disabledReason: fullReasonForResume(category),
      });
    }
  }

  // Resumable rows first (newest first within group), disabled rows after
  // (newest first within group). Mirrors the attach selector's order.
  rows.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });

  return {
    rows,
    hint: { ineligibleCount, resumableCount, activeRunningCount },
  };
}

/**
 * Footer hint for the resume selector. Plain `null` when there's nothing
 * useful to surface — the selector then falls back to its default keyboard-
 * help line.
 */
export function formatResumeSelectionFooter(hint: ResumeSelectionFooterHint): string | null {
  const fragments: string[] = [];
  if (hint.activeRunningCount > 0) {
    fragments.push(`${hint.activeRunningCount} 个会话正在运行 — 请使用 \`kaiwu attach\` 接入终端。`);
  }
  if (hint.ineligibleCount > 0) {
    fragments.push(`${hint.ineligibleCount} 个会话无法恢复（见上方原因）。`);
  }
  return fragments.length > 0 ? fragments.join(' ') : null;
}
