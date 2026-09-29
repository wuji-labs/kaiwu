#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const UI_DIR = path.resolve(REPO_ROOT, 'apps/ui');

function parseArgs(args) {
  const options = {
    platform: 'all',
    channel: 'production',
    runtimeVersion: '',
    target: '',
    toEmbedded: false,
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

Options:
  --platform <ios|android|all>   Target platform (default: all)
  --channel <name>               Target channel (default: production)
  --runtime-version <version>    Runtime version (default: from apps/ui/package.json)
  --target <path_or_ssh>         Target storage (local dir or user@host:/path)
  --to-embedded                  Roll back clients to embedded native bundle
  --to-update-id <id>            Roll back to a specific update ID
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
  return '0.2.7-native';
}

function isSshTarget(target) {
  return /^([^@:]+@)?[^:]+:.+$/.test(target) && !/^[a-zA-Z]:[\\/]/.test(target);
}

function parseSshTarget(target) {
  const colonIdx = target.indexOf(':');
  const host = target.slice(0, colonIdx);
  const remotePath = target.slice(colonIdx + 1);
  return { host, remotePath };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed with status ${result.status}: ${command} ${args.join(' ')}`);
  }
}

function rollbackLocal(targetRoot, runtimeVersion, platform, channel, toEmbedded, toUpdateId) {
  const runtimeDir = path.join(targetRoot, runtimeVersion);
  const pointerPath = path.join(runtimeDir, `current-${platform}-${channel}.json`);
  const historyPath = path.join(runtimeDir, `history-${platform}-${channel}.json`);

  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`Runtime directory does not exist: ${runtimeDir}`);
  }

  let currentPointer = null;
  if (fs.existsSync(pointerPath)) {
    try {
      currentPointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
    } catch {
      // Ignore parse error
    }
  }

  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      history = [];
    }
  }

  let newPointer;

  if (toEmbedded) {
    newPointer = {
      rollback: true,
      commitTime: new Date().toISOString(),
      platform,
      channel,
      message: 'Rolled back to embedded release',
    };
  } else if (toUpdateId) {
    const targetUpdateDir = path.join(runtimeDir, toUpdateId);
    if (!fs.existsSync(targetUpdateDir)) {
      console.warn(`[rollback-ota] Warning: target update directory ${targetUpdateDir} does not exist locally.`);
    }
    newPointer = {
      updateId: toUpdateId,
      createdAt: new Date().toISOString(),
      runtimeVersion,
      platform,
      channel,
      message: `Rolled back to updateId: ${toUpdateId}`,
    };
  } else {
    // Rollback to previous update from history
    if (!history || history.length === 0) {
      throw new Error(`No update history found for platform ${platform} channel ${channel}`);
    }
    // Find last historical record that has an updateId different from current
    let previous = null;
    while (history.length > 0) {
      const candidate = history.pop();
      if (candidate && candidate.updateId && (!currentPointer || candidate.updateId !== currentPointer.updateId)) {
        previous = candidate;
        break;
      }
    }
    if (!previous || !previous.updateId) {
      throw new Error(`No distinct previous update found in history for platform ${platform}`);
    }
    newPointer = {
      updateId: previous.updateId,
      createdAt: new Date().toISOString(),
      runtimeVersion,
      platform,
      channel,
      message: `Rolled back to previous updateId: ${previous.updateId}`,
    };
  }

  // Archive current pointer if valid
  if (currentPointer) {
    history.push(currentPointer);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  fs.writeFileSync(pointerPath, JSON.stringify(newPointer, null, 2));
  console.log(`[rollback-ota] Pointer ${pointerPath} updated:`, JSON.stringify(newPointer));
}

function rollbackSsh(sshTarget, runtimeVersion, platform, channel, toEmbedded, toUpdateId) {
  const { host, remotePath } = parseSshTarget(sshTarget);
  const sshBin = process.env.KAIWU_DEPLOY_SSH_BIN || 'ssh';

  const remoteRuntimeDir = `${remotePath}/${runtimeVersion}`;
  const remotePointerPath = `${remoteRuntimeDir}/current-${platform}-${channel}.json`;
  const remoteHistoryPath = `${remoteRuntimeDir}/history-${platform}-${channel}.json`;

  const script = `
    node -e '
      const fs = require("fs");
      const runtimeDir = "${remoteRuntimeDir}";
      const pointerPath = "${remotePointerPath}";
      const historyPath = "${remoteHistoryPath}";
      const toEmbedded = ${Boolean(toEmbedded)};
      const toUpdateId = "${toUpdateId || ''}";
      const platform = "${platform}";
      const channel = "${channel}";
      const runtimeVersion = "${runtimeVersion}";

      let currentPointer = null;
      if (fs.existsSync(pointerPath)) {
        try { currentPointer = JSON.parse(fs.readFileSync(pointerPath, "utf8")); } catch {}
      }
      let history = [];
      if (fs.existsSync(historyPath)) {
        try { history = JSON.parse(fs.readFileSync(historyPath, "utf8")); } catch {}
      }

      let newPointer;
      if (toEmbedded) {
        newPointer = {
          rollback: true,
          commitTime: new Date().toISOString(),
          platform,
          channel,
          message: "Rolled back to embedded release"
        };
      } else if (toUpdateId) {
        newPointer = {
          updateId: toUpdateId,
          createdAt: new Date().toISOString(),
          runtimeVersion,
          platform,
          channel,
          message: "Rolled back to updateId: " + toUpdateId
        };
      } else {
        if (!history || history.length === 0) {
          console.error("No history found");
          process.exit(1);
        }
        let previous = null;
        while (history.length > 0) {
          const candidate = history.pop();
          if (candidate && candidate.updateId && (!currentPointer || candidate.updateId !== currentPointer.updateId)) {
            previous = candidate;
            break;
          }
        }
        if (!previous || !previous.updateId) {
          console.error("No distinct previous update in history");
          process.exit(1);
        }
        newPointer = {
          updateId: previous.updateId,
          createdAt: new Date().toISOString(),
          runtimeVersion,
          platform,
          channel,
          message: "Rolled back to previous updateId: " + previous.updateId
        };
      }

      if (currentPointer) {
        history.push(currentPointer);
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      }
      fs.writeFileSync(pointerPath, JSON.stringify(newPointer, null, 2));
      console.log("Updated remote pointer:", JSON.stringify(newPointer));
    '
  `;

  runCommand(sshBin, [host, `bash -c '${script.replace(/'/g, "'\\''")}'`]);
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

  console.log(`=========================================`);
  console.log(`Kaiwu OTA Rollback`);
  console.log(`Runtime Version: ${runtimeVersion}`);
  console.log(`Channel:         ${options.channel}`);
  console.log(`Platforms:       ${platforms.join(', ')}`);
  console.log(`Target:          ${options.target}`);
  console.log(`Mode:            ${options.toEmbedded ? 'Rollback to embedded' : (options.toUpdateId ? `Rollback to updateId ${options.toUpdateId}` : 'Rollback to previous update')}`);
  console.log(`=========================================`);

  for (const platform of platforms) {
    console.log(`\n--- Rolling back for ${platform} ---`);
    if (isSshTarget(options.target)) {
      rollbackSsh(options.target, runtimeVersion, platform, options.channel, options.toEmbedded, options.toUpdateId);
    } else {
      const localTarget = path.resolve(options.target);
      rollbackLocal(localTarget, runtimeVersion, platform, options.channel, options.toEmbedded, options.toUpdateId);
    }
    console.log(`✓ Rollback completed for ${platform}`);
  }

  console.log('\n[rollback-ota] All platforms processed successfully.');
}

main().catch((err) => {
  console.error('\n[rollback-ota] Fatal error:', err.message);
  process.exit(1);
});
