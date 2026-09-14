import chalk from 'chalk';

import { readCredentials, type Credentials } from '@/persistence';
import { createSessionAttachFile } from '@/daemon/sessionAttachFile';
import { AGENTS } from '@/backends/catalog';
import type { CatalogAgentId } from '@/backends/types';
import { fetchSessionById, fetchSessionsPage, type RawSessionListRow, type RawSessionRecord } from '@/session/transport/http/sessionsHttp';
import { resolveSessionIdOrPrefix } from '@/session/query/resolveSessionId';
import { resolveSessionEncryptionContextFromCredentials, tryDecryptSessionMetadata } from '@/session/transport/encryption/sessionEncryptionContext';
import { encodeBase64 } from '@/api/encryption';
import { bootstrapAccountSettingsContext } from '@/settings/accountSettings/bootstrapAccountSettingsContext';
import type { AccountSettings, ConnectedServiceBindingsV1 } from '@happier-dev/protocol';
import {
  accountSettingsParse,
  ConnectedServiceBindingsV1Schema,
} from '@happier-dev/protocol';
import { canUseInkSelector, runSessionActionSelector } from '@/ui/ink/runSessionActionSelector';
import { buildCliSessionRowModel } from '@/cli/output/session/buildCliSessionRowModel';
import { buildResumeSelectionModel, formatResumeSelectionFooter } from '@/cli/commands/resumeInteractiveSelection';
import { RESUME_COMMAND_USAGE } from '@/cli/commandSurfaceManifest';
import {
  overlayDirectConnectedServiceEnvironment,
  resolveDirectConnectedServiceEnvironment,
} from '@/cli/connectedServices/resolveDirectConnectedServiceEnvironment';

import type { CommandContext, CommandHandler } from '@/cli/commandRegistry';

type FetchSessionByIdFn = (params: { token: string; sessionId: string }) => Promise<RawSessionRecord | null>;
type FetchSessionsPageFn = (params: { token: string; cursor?: string; limit?: number; activeOnly?: boolean; archivedOnly?: boolean }) => Promise<{
  sessions: RawSessionListRow[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

type ReadAccountSettingsFn = (params: { credentials: Credentials }) => Promise<AccountSettings>;

type ResumableSessionSelection =
  | { type: 'selected'; sessionId: string }
  | { type: 'cancelled' }
  | { type: 'none' };

async function resolveAgentHandler(agentId: CatalogAgentId): Promise<CommandHandler> {
  const entry = AGENTS[agentId];
  if (!entry?.getCliCommandHandler) {
    throw new Error(`Agent '${agentId}' 未注册 CLI 命令处理程序`);
  }
  return await entry.getCliCommandHandler();
}

async function defaultReadAccountSettings(params: { credentials: Credentials }): Promise<AccountSettings> {
  const ctx = await bootstrapAccountSettingsContext({ credentials: params.credentials, mode: 'fast' });
  return ctx.settings;
}

function readConnectedServicesFromSessionMetadata(
  metadata: Record<string, unknown> | null,
): ConnectedServiceBindingsV1 | null {
  const parsed = ConnectedServiceBindingsV1Schema.safeParse(metadata?.connectedServices);
  return parsed.success ? parsed.data : null;
}

async function selectResumableSessionId(params: Readonly<{
  credentials: Credentials;
  accountSettings: AccountSettings;
  fetchSessionsPageFn: FetchSessionsPageFn;
}>): Promise<ResumableSessionSelection> {
  const model = await buildResumeSelectionModel({
    credentials: params.credentials,
    accountSettings: params.accountSettings,
    fetchSessionsPageFn: params.fetchSessionsPageFn,
  });

  if (model.rows.length === 0) return { type: 'none' };

  const selection = await runSessionActionSelector({
    title: '恢复会话',
    actionVerb: 'resume',
    rows: model.rows,
    footerHint: formatResumeSelectionFooter(model.hint),
  });
  return selection.type === 'selected' ? selection : { type: 'cancelled' };
}

export async function handleResumeCommand(
  argv: string[],
  deps?: Readonly<{
    terminalRuntime?: CommandContext['terminalRuntime'];
    rawArgv?: CommandContext['rawArgv'];
    readCredentialsFn?: () => Promise<Credentials | null>;
    readAccountSettingsFn?: ReadAccountSettingsFn;
    fetchSessionByIdFn?: FetchSessionByIdFn;
    fetchSessionsPageFn?: FetchSessionsPageFn;
    resolveAgentHandlerFn?: (agentId: CatalogAgentId) => Promise<CommandHandler>;
    chdirFn?: (nextDir: string) => void;
    canUseInkSelectorFn?: () => boolean;
    selectResumableSessionIdFn?: typeof selectResumableSessionId;
  }>,
): Promise<void> {
  const hasHelpFlag = argv.some((arg) => {
    const trimmed = typeof arg === 'string' ? arg.trim() : '';
    return trimmed === '--help' || trimmed === '-h';
  });
  if (hasHelpFlag) {
    console.log(RESUME_COMMAND_USAGE);
    console.log('');
    console.log('从命令行恢复未活跃的会话 (vendor-resume)。');
    return;
  }

  const readCredentialsFn = deps?.readCredentialsFn ?? readCredentials;
  const readAccountSettingsFn = deps?.readAccountSettingsFn ?? defaultReadAccountSettings;
  const fetchSessionByIdFn = deps?.fetchSessionByIdFn ?? fetchSessionById;
  const fetchSessionsPageFn = deps?.fetchSessionsPageFn ?? fetchSessionsPage;
  const resolveAgentHandlerFn = deps?.resolveAgentHandlerFn ?? resolveAgentHandler;
  const chdirFn = deps?.chdirFn ?? ((nextDir: string) => process.chdir(nextDir));
  const canUseInkSelectorFn = deps?.canUseInkSelectorFn ?? canUseInkSelector;
  const selectResumableSessionIdFn = deps?.selectResumableSessionIdFn ?? selectResumableSessionId;

  const credentials = await readCredentialsFn();
  if (!credentials) {
    console.error(chalk.yellow('⚠️  未认证 Kaiwu 账号'));
    console.error(chalk.gray('  请先运行 "kaiwu auth login"'));
    process.exit(1);
  }

  const rawInput = argv[0]?.trim() ?? '';
  const isInteractive = rawInput.length === 0;

  const accountSettings = await readAccountSettingsFn({ credentials }).catch(() => accountSettingsParse({}));

  let sessionIdOrPrefix = rawInput;
  if (isInteractive) {
    if (!canUseInkSelectorFn()) {
      console.error(chalk.red('错误:'), '交互式恢复不可用（不支持原始 TTY 模式）。');
      console.log('');
      console.log('提示：请先运行 `kaiwu session list --resumable`，然后运行 `kaiwu resume <session-id>`。');
      process.exit(1);
    }

    const selected = await selectResumableSessionIdFn({
      credentials,
      accountSettings,
      fetchSessionsPageFn,
    });
    if (selected.type === 'cancelled') {
      console.log(chalk.blue('已取消恢复'));
      return;
    }
    if (selected.type === 'none') {
      console.log('未找到可恢复的会话。');
      return;
    }
    sessionIdOrPrefix = selected.sessionId;
  }

  if (!sessionIdOrPrefix) {
    console.error(chalk.red('错误:'), '缺少会话 ID。');
    console.log('');
    console.log('用法: kaiwu resume <sessionId>');
    process.exit(1);
  }

  let rawSession = await fetchSessionByIdFn({ token: credentials.token, sessionId: sessionIdOrPrefix });
  if (!rawSession) {
    const resolved = await resolveSessionIdOrPrefix({ credentials, idOrPrefix: sessionIdOrPrefix });
    if (!resolved.ok) {
      if (resolved.code === 'session_id_ambiguous') {
        throw new Error(`会话 ID 存在歧义 (${resolved.candidates?.join(', ') ?? '多个匹配项'})`);
      }
      if (resolved.code === 'session_lookup_timeout') {
        throw new Error('会话查询超时，请重试');
      }
      throw new Error('未找到会话');
    }
    rawSession = await fetchSessionByIdFn({ token: credentials.token, sessionId: resolved.sessionId });
  }
  if (!rawSession) throw new Error(`未找到会话: ${sessionIdOrPrefix}`);

  const sessionMetadata = tryDecryptSessionMetadata({ credentials, rawSession });
  const rowModel = buildCliSessionRowModel({ credentials, rawSession, accountSettings });

  if (rowModel.archivedAt !== null) {
    throw new Error('会话已归档，无法恢复。');
  }
  if (rowModel.active === true) {
    throw new Error('会话已处于活跃状态，无法恢复。');
  }

  const directory = rowModel.path;
  if (!directory) {
    if (!sessionMetadata) {
      throw new Error('无法解密会话元数据。请重新连接终端后重试。');
    }
    throw new Error('会话元数据缺少工作目录路径。');
  }

  const inferredAgentId = rowModel.agentId;
  if (typeof inferredAgentId !== 'string' || !Object.prototype.hasOwnProperty.call(AGENTS, inferredAgentId)) {
    throw new Error(`未知 agentId: ${String(inferredAgentId)}`);
  }
  const agentId = inferredAgentId as CatalogAgentId;

  const vendorResume = rowModel.vendorResume;
  if (!vendorResume.eligible) {
    throw new Error(`该会话不支持通过 Vendor 恢复 (${vendorResume.reasonCode})。`);
  }

  const attach = await createSessionAttachFile({
    happySessionId: rawSession.id,
    payload: rowModel.encryptionMode === 'plain'
      ? { v: 2, encryptionMode: 'plain' }
      : (() => {
        const ctx = resolveSessionEncryptionContextFromCredentials(credentials, rawSession);
        return {
          v: 2 as const,
          encryptionMode: 'e2ee' as const,
          encryptionKeyBase64: encodeBase64(ctx.encryptionKey, 'base64'),
          encryptionVariant: ctx.encryptionVariant,
        };
      })(),
  });

  const prevAttachEnv = process.env.HAPPIER_SESSION_ATTACH_FILE;
  process.env.HAPPIER_SESSION_ATTACH_FILE = attach.filePath;
  let restoreConnectedServiceEnv: (() => void) | null = null;
  let connectedServiceEnv: Awaited<
    ReturnType<typeof resolveDirectConnectedServiceEnvironment>
  > = null;
  let handlerCompleted = false;

  try {
    chdirFn(directory);
    const connectedServices = readConnectedServicesFromSessionMetadata(sessionMetadata);
    connectedServiceEnv = connectedServices
      ? await resolveDirectConnectedServiceEnvironment({
          agentId,
          credentials,
          accountSettings,
          directory,
          sessionId: rawSession.id,
          vendorResumeId: vendorResume.vendorResumeId,
          sessionMetadata,
          connectedServices,
        })
      : null;
    if (connectedServiceEnv) {
      restoreConnectedServiceEnv = overlayDirectConnectedServiceEnvironment(
        connectedServiceEnv.env,
      );
    }

    const handler = await resolveAgentHandlerFn(agentId);
    const context: CommandContext = {
      args: [agentId, '--existing-session', rawSession.id, '--resume', vendorResume.vendorResumeId, '--started-by', 'terminal'],
      rawArgv: deps?.rawArgv ?? ['kaiwu', 'resume', rawSession.id],
      terminalRuntime: deps?.terminalRuntime ?? null,
    };
    await handler(context);
    handlerCompleted = true;
  } catch (error) {
    if (!handlerCompleted) {
      connectedServiceEnv?.cleanupOnFailure?.();
    }
    await attach.cleanup().catch(() => {});
    throw error;
  } finally {
    restoreConnectedServiceEnv?.();
    if (handlerCompleted) {
      connectedServiceEnv?.cleanupOnExit?.();
    }
    if (prevAttachEnv === undefined) {
      delete process.env.HAPPIER_SESSION_ATTACH_FILE;
    } else {
      process.env.HAPPIER_SESSION_ATTACH_FILE = prevAttachEnv;
    }
  }
}

export async function handleResumeCliCommand(context: CommandContext): Promise<void> {
  try {
    await handleResumeCommand(context.args.slice(1), {
      terminalRuntime: context.terminalRuntime,
      rawArgv: context.rawArgv,
    });
  } catch (error) {
    console.error(chalk.red('错误:'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
