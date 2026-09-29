#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
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
    message: '',
    skipExport: false,
    exportDir: '',
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
    } else if (arg === '--message' && i + 1 < args.length) {
      options.message = args[++i];
    } else if (arg === '--skip-export') {
      options.skipExport = true;
    } else if (arg === '--export-dir' && i + 1 < args.length) {
      options.exportDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node scripts/ota/publish-ota.mjs [options]

Options:
  --platform <ios|android|all>   Target platform (default: all)
  --channel <name>               Target channel (default: production)
  --runtime-version <version>    Runtime version (default: from apps/ui/package.json)
  --target <path_or_ssh>         Target storage (local dir or user@host:/path)
  --message <text>               Release note or message
  --export-dir <dir>             Use existing export directory instead of running expo export
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
  // Matches user@host:path or host:path
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
    // Only npx needs a shell on Windows (it is a .cmd shim). Everything else is spawned directly so
    // paths with spaces (e.g. C:\\Program Files\\Git\\usr\\bin\\ssh.exe) and quoted remote commands survive.
    shell: process.platform === 'win32' && /^npx(\.cmd)?$/i.test(command),
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed with status ${result.status}: ${command} ${args.join(' ')}`);
  }
}

function exportPlatform(platform, outputDir) {
  console.log(`[publish-ota] Running expo export for platform: ${platform}...`);
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    EXPO_UNSTABLE_WEB_MODAL: '1',
  };

  // Run npx expo export with local project npx
  runCommand(
    'npx',
    ['expo', 'export', '--platform', platform, '--output-dir', outputDir],
    { cwd: UI_DIR, env }
  );

  // The manifest's extra.expoClient becomes Constants.expoConfig inside the updated app. Without it,
  // everything that reads expoConfig.extra (app variant, feature policy, channel) breaks after an OTA.
  console.log('[publish-ota] Capturing public expo config for manifest extra.expoClient...');
  const configResult = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['expo', 'config', '--type', 'public', '--json'],
    { cwd: UI_DIR, env, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 }
  );
  if (configResult.status !== 0 || !configResult.stdout) {
    throw new Error(`expo config failed: ${configResult.stderr || configResult.status}`);
  }
  const jsonStart = configResult.stdout.indexOf('{');
  const expoConfig = JSON.parse(configResult.stdout.slice(jsonStart));
  fs.writeFileSync(path.join(outputDir, 'expoConfig.json'), JSON.stringify(expoConfig));
}

function deployToLocal(sourceDir, targetRoot, runtimeVersion, updateId, platform, channel, message) {
  const destUpdateDir = path.join(targetRoot, runtimeVersion, updateId);
  fs.mkdirSync(destUpdateDir, { recursive: true });

  console.log(`[publish-ota] Copying export artifacts to ${destUpdateDir}...`);
  fs.cpSync(sourceDir, destUpdateDir, { recursive: true });

  const runtimeDir = path.join(targetRoot, runtimeVersion);
  const pointerPath = path.join(runtimeDir, `current-${platform}-${channel}.json`);
  const historyPath = path.join(runtimeDir, `history-${platform}-${channel}.json`);

  // Archive existing pointer if present
  if (fs.existsSync(pointerPath)) {
    try {
      const currentPointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
      let history = [];
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
      history.push(currentPointer);
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      console.log(`[publish-ota] Archived previous pointer to ${historyPath}`);
    } catch (err) {
      console.warn(`[publish-ota] Warning: failed to archive pointer history:`, err.message);
    }
  }

  // Write new pointer
  const newPointer = {
    updateId,
    createdAt: new Date().toISOString(),
    runtimeVersion,
    platform,
    channel,
    message: message || '',
  };
  fs.writeFileSync(pointerPath, JSON.stringify(newPointer, null, 2));
  console.log(`[publish-ota] Updated pointer ${pointerPath} -> ${updateId}`);
}

function deployToSsh(sourceDir, sshTarget, runtimeVersion, updateId, platform, channel, message) {
  const { host, remotePath } = parseSshTarget(sshTarget);
  const sshBin = process.env.KAIWU_DEPLOY_SSH_BIN || 'ssh';
  const scpBin = process.env.KAIWU_DEPLOY_SCP_BIN || 'scp';

  console.log(`[publish-ota] Deploying via SSH to ${host}:${remotePath}...`);

  // Create staging tarball
  const tarballPath = path.join(os.tmpdir(), `kaiwu-ota-${updateId}.tar.gz`);
  const tarBin = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
  runCommand(tarBin, ['-czf', tarballPath, '-C', sourceDir, '.']);

  const remoteUpdateDir = `${remotePath}/${runtimeVersion}/${updateId}`;
  const remoteRuntimeDir = `${remotePath}/${runtimeVersion}`;
  const remotePointerPath = `${remoteRuntimeDir}/current-${platform}-${channel}.json`;
  const remoteHistoryPath = `${remoteRuntimeDir}/history-${platform}-${channel}.json`;
  const readRemote = (remoteFile) => {
    const r = spawnSync(sshBin, [host, `cat "${remoteFile}" 2>/dev/null || true`], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
  };

  try {
    // 1. Ensure remote directories
    runCommand(sshBin, [host, `mkdir -p "${remoteUpdateDir}" "${remoteRuntimeDir}"`]);

    // 2. Transfer tarball
    const remoteTarball = `/tmp/kaiwu-ota-${updateId}.tar.gz`;
    runCommand(scpBin, [tarballPath, `${host}:${remoteTarball}`]);

    // 3. Extract tarball remotely and clean up the staging tarball
    runCommand(sshBin, [host, `tar -xzf "${remoteTarball}" -C "${remoteUpdateDir}" && rm -f "${remoteTarball}"`]);

    // 4. Update pointer & history. Computed locally (the server needs no node/python), uploaded to
    //    temp names, then renamed so the OTA server never reads a half-written pointer.
    const currentRaw = readRemote(remotePointerPath);
    let history = [];
    const historyRaw = readRemote(remoteHistoryPath);
    if (historyRaw) {
      try { history = JSON.parse(historyRaw); } catch { history = []; }
    }
    if (currentRaw) {
      try { history.push(JSON.parse(currentRaw)); } catch { /* ignore unreadable pointer */ }
    }
    const pointer = { updateId, createdAt: new Date().toISOString(), runtimeVersion, platform, channel, message: message || '' };
    const localPointer = path.join(os.tmpdir(), `kaiwu-ota-pointer-${updateId}.json`);
    const localHistory = path.join(os.tmpdir(), `kaiwu-ota-history-${updateId}.json`);
    fs.writeFileSync(localPointer, JSON.stringify(pointer, null, 2));
    fs.writeFileSync(localHistory, JSON.stringify(history, null, 2));
    try {
      runCommand(scpBin, [localHistory, `${host}:${remoteHistoryPath}.tmp`]);
      runCommand(scpBin, [localPointer, `${host}:${remotePointerPath}.tmp`]);
      runCommand(sshBin, [host, `mv "${remoteHistoryPath}.tmp" "${remoteHistoryPath}" && mv "${remotePointerPath}.tmp" "${remotePointerPath}"`]);
    } finally {
      for (const p of [localPointer, localHistory]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
    }
    console.log(`[publish-ota] Remote deploy completed successfully.`);
  } finally {
    try {
      fs.unlinkSync(tarballPath);
    } catch {
      // Ignore cleanup error
    }
  }
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
  console.log(`Kaiwu OTA Publish`);
  console.log(`Runtime Version: ${runtimeVersion}`);
  console.log(`Channel:         ${options.channel}`);
  console.log(`Platforms:       ${platforms.join(', ')}`);
  console.log(`Target:          ${options.target}`);
  if (options.message) console.log(`Message:         ${options.message}`);
  console.log(`=========================================`);

  for (const platform of platforms) {
    const updateId = crypto.randomUUID();
    console.log(`\n--- Publishing for ${platform} (Update ID: ${updateId}) ---`);

    let exportDir = options.exportDir;
    let tempDirCreated = false;

    if (!exportDir) {
      exportDir = fs.mkdtempSync(path.join(os.tmpdir(), `kaiwu-expo-export-${platform}-`));
      tempDirCreated = true;
      exportPlatform(platform, exportDir);
    }

    try {
      if (isSshTarget(options.target)) {
        deployToSsh(exportDir, options.target, runtimeVersion, updateId, platform, options.channel, options.message);
      } else {
        const localTarget = path.resolve(options.target);
        deployToLocal(exportDir, localTarget, runtimeVersion, updateId, platform, options.channel, options.message);
      }
      console.log(`✓ Published ${platform} update ${updateId} successfully!`);
    } finally {
      if (tempDirCreated && exportDir) {
        try {
          fs.rmSync(exportDir, { recursive: true, force: true });
        } catch {
          // Ignore temp cleanup error
        }
      }
    }
  }

  console.log('\n[publish-ota] All platforms published successfully.');
}

main().catch((err) => {
  console.error('\n[publish-ota] Fatal error:', err.message);
  process.exit(1);
});
