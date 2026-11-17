#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const UI_DIR = path.resolve(REPO_ROOT, 'apps/ui');

const EMBEDDED_DIRECTIVE_REFUSAL =
  'Rolling back to the embedded release is refused: on 2026-11-17 both rollBackToEmbedded directives served to '
  + 'iOS 0.2.25 were followed by launch crashes, which stopped once a normal update was served again. '
  + 'Roll back by republishing a known-good update instead (default mode, or --to-update-id <id>). '
  + 'Pass --allow-embedded-directive only after the directive path is proven on a real device.';

function parseArgs(args) {
  const options = {
    platform: 'all',
    channel: 'production',
    runtimeVersion: '',
    target: '',
    toEmbedded: false,
    allowEmbeddedDirective: false,
    toUpdateId: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--platform' && i + 1 < args.length) {
      options.platform = args[++i].toLowerCase();
    } else if (arg === '--channel' && i + 1 < args.length) {
      options.channel = args[++i];
    } else if (arg === '--runtime-version' && i + 1 < args.length) {
      options.runtimeVersion = args[++i];
    } else if (arg === '--target' && i + 1 < args.length) {
      options.target = args[++i];
    } else if (arg === '--to-embedded') {
      options.toEmbedded = true;
    } else if (arg === '--allow-embedded-directive') {
      options.allowEmbeddedDirective = true;
    } else if (arg === '--to-update-id' && i + 1 < args.length) {
      options.toUpdateId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node scripts/ota/rollback-ota.mjs [options]

Rolls back by republishing a known-good update under a new update id. Clients launch the newest
update they hold, so pointing back at an old id (already stored with its old createdAt) would
never replace the bad update.

Options:
  --platform <ios|android|all>   Target platform (default: all)
  --channel <name>               Target channel (default: production)
  --runtime-version <version>    Runtime version (default: from apps/ui/package.json)
  --target <path_or_ssh>         Target storage (local dir or user@host:/path)
  --to-update-id <id>            Republish this update (default: the previous distinct update)
  --to-embedded                  Serve a rollBackToEmbedded directive (refused, see below)
  --allow-embedded-directive     Required with --to-embedded; the directive crashed iOS 0.2.25
  --help, -h                     Show this help message
`);
}

function resolveDefaultRuntimeVersion() {
  const pkgPath = path.join(UI_DIR, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.happierExpoRuntimeVersion) {
      return pkg.happierExpoRuntimeVersion.trim();
    }
  } catch {
    // Ignore error
  }
  return 'kaiwu-1-native';
}

function isSshTarget(target) {
  return /^([^@:]+@)?[^:]+:.+$/.test(target) && !/^[a-zA-Z]:[\\/]/.test(target);
}

function parseSshTarget(target) {
  const colonIdx = target.indexOf(':');
  return { host: target.slice(0, colonIdx), remotePath: target.slice(colonIdx + 1) };
}

/** The update whose content a pointer serves (a republished copy serves its source's content). */
function contentIdOf(pointer) {
  if (!pointer || typeof pointer !== 'object') return null;
  return pointer.sourceUpdateId || pointer.updateId || null;
}

/**
 * Pure rollback decision. Returns the new pointer, the history to persist, and the update directory
 * to copy (`copyFrom`, null for an embedded directive).
 */
export function planRollback(input) {
  const { currentPointer, platform, channel, runtimeVersion, now, newUpdateId } = input;
  const history = Array.isArray(input.history) ? [...input.history] : [];
  const nextHistory = currentPointer ? [...history, currentPointer] : history;

  if (input.toEmbedded) {
    if (!input.allowEmbeddedDirective) {
      throw new Error(EMBEDDED_DIRECTIVE_REFUSAL);
    }
    return {
      copyFrom: null,
      history: nextHistory,
      newPointer: { rollback: true, commitTime: now, platform, channel, message: 'Rolled back to embedded release' },
    };
  }

  let sourceUpdateId = input.toUpdateId || null;
  if (!sourceUpdateId) {
    const currentContentId = contentIdOf(currentPointer);
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const candidateContentId = contentIdOf(history[i]);
      if (candidateContentId && candidateContentId !== currentContentId) {
        sourceUpdateId = candidateContentId;
        break;
      }
    }
    if (!sourceUpdateId) {
      throw new Error(`No distinct previous update found in history for platform ${platform} channel ${channel}`);
    }
  }

  return {
    copyFrom: sourceUpdateId,
    history: nextHistory,
    newPointer: {
      updateId: newUpdateId,
      sourceUpdateId,
      createdAt: now,
      runtimeVersion,
      platform,
      channel,
      message: `Rolled back by republishing updateId: ${sourceUpdateId}`,
    },
  };
}

function parseJsonOr(raw, fallback) {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createLocalStore(runtimeDir) {
  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`Runtime directory does not exist: ${runtimeDir}`);
  }
  return {
    readText: (name) => {
      const filePath = path.join(runtimeDir, name);
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    },
    copyUpdate: (fromId, toId) => {
      const from = path.join(runtimeDir, fromId);
      if (!fs.existsSync(from)) throw new Error(`Update directory does not exist: ${from}`);
      fs.cpSync(from, path.join(runtimeDir, toId), { recursive: true });
    },
    writeText: (name, text) => {
      const filePath = path.join(runtimeDir, name);
      fs.writeFileSync(`${filePath}.tmp`, text);
      fs.renameSync(`${filePath}.tmp`, filePath);
    },
  };
}

function createSshStore(host, remoteRuntimeDir) {
  const sshBin = process.env.KAIWU_DEPLOY_SSH_BIN || 'ssh';
  // Remote commands are built from these values without quoting, so they must not need any.
  const assertSafe = (value) => {
    if (!/^[A-Za-z0-9._\/~-]+$/.test(value)) throw new Error(`Unsafe remote path segment: ${value}`);
    return value;
  };
  assertSafe(remoteRuntimeDir);
  const run = (command, stdin) => {
    const result = spawnSync(sshBin, [host, command], { input: stdin, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) {
      throw new Error(`Remote command failed (${result.status}): ${command}\n${result.stderr || result.error?.message || ''}`);
    }
    return result.stdout;
  };
  const remote = (name) => `${remoteRuntimeDir}/${assertSafe(name)}`;

  run(`test -d ${remoteRuntimeDir}`);
  return {
    readText: (name) => run(`test -f ${remote(name)} && cat ${remote(name)} || true`),
    copyUpdate: (fromId, toId) => run(`test -d ${remote(fromId)} && cp -a ${remote(fromId)} ${remote(toId)}`),
    writeText: (name, text) => run(`cat > ${remote(name)}.tmp && mv ${remote(name)}.tmp ${remote(name)}`, text),
  };
}

function rollbackPlatform(store, options, runtimeVersion, platform) {
  const pointerName = `current-${platform}-${options.channel}.json`;
  const historyName = `history-${platform}-${options.channel}.json`;

  const plan = planRollback({
    currentPointer: parseJsonOr(store.readText(pointerName), null),
    history: parseJsonOr(store.readText(historyName), []),
    toUpdateId: options.toUpdateId,
    toEmbedded: options.toEmbedded,
    allowEmbeddedDirective: options.allowEmbeddedDirective,
    platform,
    channel: options.channel,
    runtimeVersion,
    now: new Date().toISOString(),
    newUpdateId: crypto.randomUUID(),
  });

  // Copy first: the pointer must never name an update directory that is not fully in place.
  if (plan.copyFrom) {
    store.copyUpdate(plan.copyFrom, plan.newPointer.updateId);
  }
  store.writeText(historyName, JSON.stringify(plan.history, null, 2));
  store.writeText(pointerName, JSON.stringify(plan.newPointer, null, 2));
  console.log(`[rollback-ota] ${pointerName} updated:`, JSON.stringify(plan.newPointer));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.target) {
    console.error('Error: --target parameter is required (local directory or user@host:path)');
    process.exit(1);
  }

  const runtimeVersion = options.runtimeVersion || resolveDefaultRuntimeVersion();
  const platforms = options.platform === 'all' ? ['ios', 'android'] : [options.platform];

  for (const p of platforms) {
    if (p !== 'ios' && p !== 'android') {
      console.error(`Error: invalid platform "${p}". Must be ios, android, or all.`);
      process.exit(1);
    }
  }

  const mode = options.toEmbedded
    ? 'Rollback to embedded'
    : options.toUpdateId
      ? `Republish updateId ${options.toUpdateId}`
      : 'Republish previous update';
  console.log(`=========================================`);
  console.log(`Kaiwu OTA Rollback`);
  console.log(`Runtime Version: ${runtimeVersion}`);
  console.log(`Channel:         ${options.channel}`);
  console.log(`Platforms:       ${platforms.join(', ')}`);
  console.log(`Target:          ${options.target}`);
  console.log(`Mode:            ${mode}`);
  console.log(`=========================================`);

  let store;
  if (isSshTarget(options.target)) {
    const { host, remotePath } = parseSshTarget(options.target);
    store = createSshStore(host, `${remotePath.replace(/\/+$/, '')}/${runtimeVersion}`);
  } else {
    store = createLocalStore(path.join(path.resolve(options.target), runtimeVersion));
  }

  for (const platform of platforms) {
    console.log(`\n--- Rolling back for ${platform} ---`);
    rollbackPlatform(store, options, runtimeVersion, platform);
    console.log(`✓ Rollback completed for ${platform}`);
  }

  console.log('\n[rollback-ota] All platforms processed successfully.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('\n[rollback-ota] Fatal error:', err.message);
    process.exit(1);
  });
}
