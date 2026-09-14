import chalk from 'chalk';

import { configuration, reloadConfiguration } from '@/configuration';
import {
  addServerProfile,
  getActiveServerProfile,
  getServerProfile,
  listServerProfiles,
  removeServerProfile,
  setServerProfileEndpointsById,
  upsertServerProfileByUrl,
  useServerProfile,
} from '@/server/serverProfiles';
import { probeServerVersion, type ProbeServerVersionResult } from '@/server/serverTest';

import {
  argvValue,
  defaultNameFromUrl,
  defaultWebappUrlFromServerUrl,
  isInteractiveTerminal,
  normalizeUrlOrThrow,
  parseYesNoWithDefault,
  promptInput,
  runCliAction,
} from './commandUtilities';
import { wantsJson, printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { tailscaleServeHttpsUrlForInternalServerUrl } from '@/integrations/tailscale/tailscaleServe';
import { fetchServerAdvertisedUrls } from '@/server/serverCapabilities';
import { promptForCurrentMachineReachableServerUrl } from '@/server/reachability/promptCurrentMachineReachableServerUrl';
import {
  isInsecureRemoteHttpServerUrl,
  isLocalishServerUrl,
  isLoopbackHttpServerUrl,
} from '@/server/serverUrlClassification';
import { createServerUrlComparableKey } from '@happier-dev/protocol';
import { runServerSelectionBackgroundServiceFollowUp } from '../backgroundServiceFollowUp.js';

export async function runServerSubcommand(subcommand: string, args: string[]): Promise<boolean> {
  switch (subcommand) {
    case 'list':
      await cmdList(args.slice(1));
      return true;
    case 'current':
      await cmdCurrent(args.slice(1));
      return true;
    case 'add':
      await cmdAdd(args.slice(1));
      return true;
    case 'use':
      await cmdUse(args.slice(1));
      return true;
    case 'remove':
      await cmdRemove(args.slice(1));
      return true;
    case 'test':
      await cmdTest(args.slice(1));
      return true;
    case 'set':
      await cmdSet(args.slice(1));
      return true;
    default:
      return false;
  }
}

type ServerProfileSummary = Readonly<{
  id: string;
  name: string;
  serverUrl: string;
  comparableKey: string;
  localServerUrl?: string;
  webappUrl: string;
  lastUsedAt?: number;
}>;

function safeComparableKey(serverUrlRaw: unknown): string {
  const serverUrl = String(serverUrlRaw ?? '');
  try {
    return createServerUrlComparableKey(serverUrl);
  } catch {
    return serverUrl;
  }
}

function summarizeProfile(p: any): ServerProfileSummary {
  const out: ServerProfileSummary = {
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    serverUrl: String(p.serverUrl ?? ''),
    comparableKey: safeComparableKey(p.serverUrl),
    ...(typeof (p as any).localServerUrl === 'string' && String((p as any).localServerUrl).trim()
      ? { localServerUrl: String((p as any).localServerUrl).trim() }
      : {}),
    webappUrl: String(p.webappUrl ?? ''),
    ...(typeof p.lastUsedAt === 'number' ? { lastUsedAt: p.lastUsedAt } : {}),
  };
  return out;
}

function shouldAutoInferPublicServerUrl(): boolean {
  const raw = String(process.env.HAPPIER_TAILSCALE_AUTO_PUBLIC_URL ?? '').trim().toLowerCase();
  if (!raw) return true;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function resolveTailscaleServeStatusTimeoutMs(): number {
  const raw = Number.parseInt(String(process.env.HAPPIER_TAILSCALE_SERVE_STATUS_TIMEOUT_MS ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 750;
}

function relayProbeFailureDetailLines(result: Extract<ProbeServerVersionResult, { ok: false }>): readonly string[] {
  return [
    `  地址：${result.url}`,
    ...(result.status ? [`  状态：${result.status}`] : []),
    `  错误：${result.error}`,
  ];
}

/**
 * Check that a relay URL actually answers before it is written to settings,
 * using the same `/v1/version` probe `kaiwu server test` runs.
 *
 * A relay that does not answer is nearly always a typo or a URL that is not up
 * yet; persisting it only moves the failure to `kaiwu auth login`, where it
 * is much harder to read. The answer therefore follows the same shape as the
 * local/LAN question in `cmdAdd`: an interactive terminal is asked, and every
 * non-interactive caller (`--json`, no TTY) gets the prompt's own default —
 * refuse — with `--yes` as the deterministic opt-out.
 */
async function assertRelayUrlAnswersBeforePersisting(params: Readonly<{
  probeUrl: string;
  interactive: boolean;
}>): Promise<void> {
  const result = await probeServerVersion(params.probeUrl);
  if (result.ok) return;

  const headline = `开物中继未在 ${params.probeUrl} 响应。`;
  const detailLines = relayProbeFailureDetailLines(result);

  if (!params.interactive) {
    throw relayUnreachableError([
      headline,
      ...detailLines,
      '  未保存任何内容。请检查地址，或使用 --yes 强制保存。',
    ].join('\n'));
  }

  console.log(chalk.yellow(headline));
  for (const line of detailLines) console.log(chalk.gray(line));
  const answer = await promptInput('仍要保存此中继配置吗？[y/N]：');
  if (parseYesNoWithDefault(answer, false)) return;

  throw relayUnreachableError(`未保存中继：${params.probeUrl} 未通过版本检查。`);
}

function relayUnreachableError(message: string): Error {
  const error: Error & { code?: string } = new Error(message);
  error.code = 'server_unreachable';
  return error;
}

async function cmdList(args: string[]): Promise<void> {
  const active = await getActiveServerProfile();
  const profiles = await listServerProfiles();
  if (wantsJson(args)) {
    await printJsonEnvelope({
      ok: true,
      kind: 'server_list',
      data: {
        activeServerId: active.id,
        profiles: profiles.map(summarizeProfile),
      },
    });
    return;
  }
  if (profiles.length === 0) {
    console.log(chalk.gray('（未配置中继配置）'));
    return;
  }

  for (const p of profiles.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))) {
    const marker = p.id === active.id ? chalk.green('✓') : ' ';
    console.log(`${marker} ${chalk.bold(p.name)} (${p.id})`);
    console.log(`    ${chalk.gray('中继：')} ${p.serverUrl}`);
    if (p.localServerUrl && p.localServerUrl !== p.serverUrl) {
      console.log(`    ${chalk.gray('本地：')} ${p.localServerUrl}`);
    }
    console.log(`    ${chalk.gray('网页：')} ${p.webappUrl}`);
  }
}

async function cmdCurrent(args: string[]): Promise<void> {
  const active = await getActiveServerProfile();
  if (wantsJson(args)) {
    await printJsonEnvelope({
      ok: true,
      kind: 'server_current',
      data: { active: summarizeProfile(active) },
    });
    return;
  }
  console.log(chalk.bold('当前中继配置'));
  console.log(`${chalk.gray('名称：')}   ${active.name}`);
  console.log(`${chalk.gray('ID：')}     ${active.id}`);
  console.log(`${chalk.gray('中继：')}  ${active.serverUrl}`);
  if (active.localServerUrl && active.localServerUrl !== active.serverUrl) {
    console.log(`${chalk.gray('本地：')} ${active.localServerUrl}`);
  }
  console.log(`${chalk.gray('网页：')} ${active.webappUrl}`);
}

async function cmdAdd(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const interactive = isInteractiveTerminal() && !json;
  let name = argvValue(args, '--name');
  let serverUrlRaw = argvValue(args, '--server-url');
  let localServerUrlRaw = argvValue(args, '--local-server-url');
  let publicServerUrlRaw = argvValue(args, '--public-server-url');
  let webappUrlRaw = argvValue(args, '--webapp-url');
  const hasUse = args.includes('--use');
  const hasNoUse = args.includes('--no-use');
  let shouldUse = hasUse;
  let startDaemon = args.includes('--start-daemon');
  let installService = args.includes('--install-service');
  const assumeYes = args.includes('--yes');

  if (json && (startDaemon || installService)) {
    const err: any = new Error('--json 模式不支持：--start-daemon/--install-service');
    err.code = 'unsupported';
    throw err;
  }

  if (hasUse && hasNoUse) {
    throw new Error('--use 和 --no-use 不能同时使用');
  }

  if (!interactive) {
    if (!name || !serverUrlRaw) {
      throw new Error(
        [
          '非交互模式：`kaiwu server add` 缺少必填参数。',
          '请提供：--name <name> --server-url <relay-url> [--local-server-url <url>] [--webapp-url <url>] [--use]。',
          '可选操作：--start-daemon、--install-service。',
        ].join(' '),
      );
    }
  } else {
    if (!serverUrlRaw) {
      serverUrlRaw = (await promptInput('中继地址（https://...）：')).trim();
    }

    if (!localServerUrlRaw && !publicServerUrlRaw) {
      const normalized = normalizeUrlOrThrow(serverUrlRaw, '--server-url');
      if (isLocalishServerUrl(normalized)) {
        const answer = await promptInput('此地址是否只能从本机或局域网访问？[Y/n]：');
        const localOnly = parseYesNoWithDefault(answer, true);
        if (localOnly) {
          localServerUrlRaw = normalized;
          const canonical = (await promptForCurrentMachineReachableServerUrl({
            localServerUrl: normalized,
            remoteDescription: 'other machines',
          })).trim();
          if (!canonical) {
            throw new Error(
              '缺少规范中继地址。请提供公开 HTTPS 地址，或运行 `kaiwu server add --local-server-url <url> --server-url <canonical>`。',
            );
          }
          serverUrlRaw = canonical;
        }
      }
    }

    const serverUrlForDefaults = normalizeUrlOrThrow(serverUrlRaw, '--server-url');
    if (!name) {
      const defaultName = defaultNameFromUrl(serverUrlForDefaults);
      const answer = await promptInput(`中继配置名称 [${defaultName}]：`);
      name = answer.trim() || defaultName;
    }
    if (!hasUse && !hasNoUse) {
      const answer = await promptInput('现在将此中继设为当前中继吗？[Y/n]：');
      shouldUse = parseYesNoWithDefault(answer, true);
    } else if (hasNoUse) {
      shouldUse = false;
    }
  }

  if (!name) throw new Error('缺少 --name');
  // Compatibility: legacy `--public-server-url` (canonical) + legacy `--server-url` (local).
  if (publicServerUrlRaw) {
    if (serverUrlRaw && !localServerUrlRaw) {
      localServerUrlRaw = serverUrlRaw;
      serverUrlRaw = publicServerUrlRaw;
    } else if (!serverUrlRaw) {
      serverUrlRaw = publicServerUrlRaw;
    }
  }

  let serverUrl = normalizeUrlOrThrow(serverUrlRaw, '--server-url');
  let localServerUrl = localServerUrlRaw ? normalizeUrlOrThrow(localServerUrlRaw, '--local-server-url') : '';

  if (!publicServerUrlRaw && shouldAutoInferPublicServerUrl() && isLoopbackHttpServerUrl(serverUrl) && !localServerUrl) {
    const inferred = await tailscaleServeHttpsUrlForInternalServerUrl({
      internalServerUrl: serverUrl,
      timeoutMs: resolveTailscaleServeStatusTimeoutMs(),
      env: process.env,
    });
    if (inferred) {
      localServerUrl = serverUrl;
      serverUrl = inferred;
    }
  }

  // Best-effort: ask the server what its canonical/share URL is.
  try {
    const advertised = await fetchServerAdvertisedUrls({ apiServerUrl: localServerUrl || serverUrl, timeoutMs: 1500 });
    const advertisedCanonical = advertised?.canonicalServerUrl ?? null;
    const advertisedWebappUrl = advertised?.webappUrl ?? null;

    if (advertisedCanonical && advertisedCanonical !== serverUrl) {
      const shouldAdopt = interactive
        ? parseYesNoWithDefault(await promptInput(`服务器报告规范地址为 ${advertisedCanonical}。使用它吗？[Y/n]：`), true)
        : (!localServerUrl && (isLocalishServerUrl(serverUrl) || isInsecureRemoteHttpServerUrl(serverUrl)));

      if (shouldAdopt) {
        if (!localServerUrl && isLocalishServerUrl(serverUrl)) {
          localServerUrl = serverUrl;
        }
        serverUrl = advertisedCanonical;
      }
    }

    if (!webappUrlRaw && advertisedWebappUrl) {
      webappUrlRaw = advertisedWebappUrl;
    }
  } catch {
    // best-effort
  }
  const webappUrl = webappUrlRaw
    ? normalizeUrlOrThrow(webappUrlRaw, '--webapp-url')
    : defaultWebappUrlFromServerUrl(serverUrl);

  if (!assumeYes) {
    await assertRelayUrlAnswersBeforePersisting({ probeUrl: localServerUrl || serverUrl, interactive });
  }

  const created = await addServerProfile({ name, serverUrl, ...(localServerUrl ? { localServerUrl } : {}), webappUrl, use: shouldUse });
  const active = shouldUse ? created : await getActiveServerProfile();

  if (json) {
    await printJsonEnvelope({
      ok: true,
      kind: 'server_add',
      data: { created: summarizeProfile(created), active: summarizeProfile(active), used: shouldUse },
    });
    return;
  }

  if (shouldUse) reloadConfiguration();
  console.log(chalk.green(`✓ 已保存中继配置：${created.name}（${created.id}）`));
  const prefix = `kaiwu --server ${created.id}`;
  if (shouldUse) {
    console.log(chalk.gray(`  当前中继：${created.serverUrl}`));
    if (created.localServerUrl && created.localServerUrl !== created.serverUrl) {
      console.log(chalk.gray(`  本地 API 地址：${created.localServerUrl}`));
    }
  }

  if (!interactive || shouldUse) {
    console.log('');
    console.log(chalk.bold('下一步（可选）'));
    console.log(chalk.gray(`  启动守护进程：${prefix} daemon start`));
    console.log(chalk.gray(`  启用自动启动：${prefix} service install`));
  }

  if (installService) {
    await runCliAction(['--server', created.id, 'daemon', 'service', 'install']);
  }
  if (startDaemon && !installService) {
    await runCliAction(['--server', created.id, 'daemon', 'start']);
  }
  if (shouldUse && !installService && !startDaemon) {
    await runServerSelectionBackgroundServiceFollowUp({
      interactive: isInteractiveTerminal(),
      targetServerUrl: created.serverUrl,
    });
  }
}

async function cmdUse(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const identifier = String(args[0] ?? '').trim();
  if (!identifier) throw new Error('缺少中继配置 ID 或名称');
  const active = await useServerProfile(identifier);
  reloadConfiguration();
  if (json) {
    await printJsonEnvelope({ ok: true, kind: 'server_use', data: { active: summarizeProfile(active) } });
    return;
  }
  console.log(chalk.green(`✓ 当前中继：${active.name}（${active.id}）`));
  console.log(chalk.gray(`  ${active.serverUrl}`));

  await runServerSelectionBackgroundServiceFollowUp({
    interactive: isInteractiveTerminal(),
    targetServerUrl: active.serverUrl,
  });
}

async function cmdRemove(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const identifier = String(args[0] ?? '').trim();
  if (!identifier) throw new Error('缺少中继配置 ID 或名称');
  const force = args.includes('--force');
  const out = await removeServerProfile(identifier, { force });
  reloadConfiguration();
  if (json) {
    await printJsonEnvelope({
      ok: true,
      kind: 'server_remove',
      data: { removed: summarizeProfile(out.removed), active: summarizeProfile(out.active) },
    });
    return;
  }
  console.log(chalk.green(`✓ 已移除中继配置：${out.removed.name}（${out.removed.id}）`));
  console.log(chalk.gray(`  当前中继：${out.active.name}（${out.active.id}）`));
}

async function cmdTest(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const nonFlagArgs = args.filter((a) => !String(a).startsWith('-'));
  const identifier = String(nonFlagArgs[0] ?? '').trim();
  const profile = identifier ? await getServerProfile(identifier) : await getActiveServerProfile();
  const result = await probeServerVersion(profile.localServerUrl ?? profile.serverUrl);
  if (json) {
    await printJsonEnvelope(
      {
        ok: true,
        kind: 'server_test',
        data: result,
      },
      { exitCode: result.ok ? 0 : 1 },
    );
    return;
  }
  if (!result.ok) {
    console.error(chalk.red(`✗ 中继测试失败：${profile.serverUrl}`));
    for (const line of relayProbeFailureDetailLines(result)) console.error(chalk.gray(line));
    process.exit(1);
  }
  console.log(chalk.green(`✓ 中继可访问：${profile.serverUrl}`));
  console.log(chalk.gray(`  地址：${result.url}`));
  if (result.version) console.log(chalk.gray(`  版本：${result.version}`));
}

async function cmdSet(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const serverId = argvValue(args, '--server-id');
  const migrateMatchingProfileState = args.includes('--migrate-matching-profile-state');
  const hasExplicitLocalServerUrl = args.some((arg) => arg === '--local-server-url' || arg.startsWith('--local-server-url='));
  let serverUrlRaw = argvValue(args, '--server-url');
  let localServerUrlRaw = argvValue(args, '--local-server-url');
  const publicServerUrlRaw = argvValue(args, '--public-server-url');
  let webappUrlRaw = argvValue(args, '--webapp-url');

  // Compatibility: legacy `--public-server-url` (canonical) + legacy `--server-url` (local).
  if (publicServerUrlRaw) {
    if (serverUrlRaw && !localServerUrlRaw) {
      localServerUrlRaw = serverUrlRaw;
      serverUrlRaw = publicServerUrlRaw;
    } else if (!serverUrlRaw) {
      serverUrlRaw = publicServerUrlRaw;
    }
  }

  let serverUrl = normalizeUrlOrThrow(serverUrlRaw, '--server-url');
  let localServerUrl = localServerUrlRaw ? normalizeUrlOrThrow(localServerUrlRaw, '--local-server-url') : '';

  if (!serverId && !publicServerUrlRaw && shouldAutoInferPublicServerUrl() && isLoopbackHttpServerUrl(serverUrl) && !localServerUrl) {
    const inferred = await tailscaleServeHttpsUrlForInternalServerUrl({
      internalServerUrl: serverUrl,
      timeoutMs: resolveTailscaleServeStatusTimeoutMs(),
      env: process.env,
    });
    if (inferred) {
      localServerUrl = serverUrl;
      serverUrl = inferred;
    }
  }

  // Best-effort: ask the server what its canonical/share URL is.
  if (!serverId) {
    try {
      const advertised = await fetchServerAdvertisedUrls({ apiServerUrl: localServerUrl || serverUrl, timeoutMs: 1500 });
      const advertisedCanonical = advertised?.canonicalServerUrl ?? null;
      const advertisedWebappUrl = advertised?.webappUrl ?? null;

      if (advertisedCanonical && advertisedCanonical !== serverUrl) {
        // cmdSet is always non-interactive today; adopt only when the current serverUrl is unshareable or insecure.
        const shouldAdopt = !localServerUrl && (isLocalishServerUrl(serverUrl) || isInsecureRemoteHttpServerUrl(serverUrl));
        if (shouldAdopt) {
          if (isLocalishServerUrl(serverUrl)) {
            localServerUrl = serverUrl;
          }
          serverUrl = advertisedCanonical;
        }
      }

      if (!webappUrlRaw && advertisedWebappUrl) {
        // Only override when not explicitly set.
        // When it is set, callers may be pointing at a custom webapp origin.
        // (A future version can prompt here in interactive mode.)
        webappUrlRaw = advertisedWebappUrl;
      }
    } catch {
      // best-effort
    }
  }
  const webappUrl = webappUrlRaw
    ? normalizeUrlOrThrow(webappUrlRaw, '--webapp-url')
    : defaultWebappUrlFromServerUrl(serverUrl);
  const created = serverId
    ? await setServerProfileEndpointsById({
        id: serverId,
        serverUrl,
        ...(hasExplicitLocalServerUrl ? { localServerUrl } : {}),
        webappUrl,
        use: true,
        migrateMatchingProfileState,
      })
    : await upsertServerProfileByUrl({ name: 'custom', serverUrl, ...(localServerUrl ? { localServerUrl } : {}), webappUrl, use: true });
  reloadConfiguration();
  if (json) {
    await printJsonEnvelope({ ok: true, kind: 'server_set', data: { active: summarizeProfile(created) } });
    return;
  }
  console.log(chalk.green(`✓ 当前中继：${created.name}（${created.id}）`));
  console.log(chalk.gray(`  ${created.serverUrl}`));

  await runServerSelectionBackgroundServiceFollowUp({
    interactive: isInteractiveTerminal(),
    targetServerUrl: created.serverUrl,
  });
}
