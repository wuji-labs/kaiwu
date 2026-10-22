#!/usr/bin/env node
/**
 * scripts/release/publish-downloads.mjs
 *
 * 自动化发布全平台安装包至开物官网下载中心 (kaiwu.wujilabs.cn/download)
 *
 * 功能：
 * 1. 校验输入参数（平台、版本号、本地文件路径）
 * 2. 计算本地文件 SHA256 校验和与体积
 * 3. 规避 6 Mbps 源站带宽瓶颈：对于大文件自动通过腾讯云 COS 中转并由服务器内网拉取，或小文件直传
 * 4. 在生产服务器组织版本化文件目录：/opt/wuji-kaiwu/docs/html/releases/<platform>/<version>/<file>
 * 5. 创建/更新 latest 软链接或别名：/opt/wuji-kaiwu/docs/html/releases/<platform>/latest/<file>
 * 6. 服务器端执行 sha256sum 严格比对校验
 * 7. 更新下载中心清单 manifest.json
 * 8. 验证生产环境对应跳转路由可用性 (HTTP 302 -> 200)
 *
 * 用法：
 *   node scripts/release/publish-downloads.mjs --platform windows --version 0.2.28 --file dist/release-assets/cli/kaiwu-v0.2.28-windows-x64.zip
 *   node scripts/release/publish-downloads.mjs --platform desktop-windows --version 0.2.28 --file dist/tauri/kaiwu-desktop-v0.2.28-windows-x64.zip
 *   node scripts/release/publish-downloads.mjs --platform android --version 0.2.24 --file dist/android/kaiwu.apk
 *   node scripts/release/publish-downloads.mjs --platform server --version 0.2.11-kw.1 --file dist/server/happier-server.tar.gz
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

const SUPPORTED_PLATFORMS = [
    'desktop-windows',
    'desktop-macos',
    'desktop-macos-intel',
    'desktop-linux',
    'windows',
    'macos',
    'linux',
    'android',
    'ios',
    'server',
    'npm',
    'harmony',
];

const CANONICAL_FILENAMES = {
    'desktop-windows': (ver) => `kaiwu-desktop-v${ver}-windows-x64.zip`,
    'desktop-macos': (ver) => `kaiwu-desktop-v${ver}-macos-apple-silicon.dmg`,
    'desktop-macos-intel': (ver) => `kaiwu-desktop-v${ver}-macos-intel.dmg`,
    'desktop-linux': (ver) => `kaiwu-desktop-v${ver}-linux-x64.AppImage`,
    windows: (ver) => `kaiwu-v${ver}-windows-x64.zip`,
    macos: (ver) => `kaiwu-cli-${ver}.tgz`,
    linux: (ver) => `kaiwu-cli-${ver}.tgz`,
    android: (ver) => `kaiwu-${ver}.apk`,
    ios: (ver) => `kaiwu-${ver}-unsigned.ipa`,
    server: (ver) => `happier-server-v${ver}-linux-x64.tar.gz`,
    npm: (ver) => `kaiwu-cli-${ver}.tgz`,
    harmony: (ver) => `kaiwu-v${ver}-harmony.hap`,
};

const LATEST_ALIASES = {
    'desktop-windows': 'kaiwu-desktop-windows-x64.zip',
    'desktop-macos': 'kaiwu-desktop-macos-apple-silicon.dmg',
    'desktop-macos-intel': 'kaiwu-desktop-macos-intel.dmg',
    'desktop-linux': 'kaiwu-desktop-linux-x64.AppImage',
    windows: 'kaiwu-windows-x64.zip',
    macos: 'kaiwu-cli.tgz',
    linux: 'kaiwu-cli.tgz',
    android: 'kaiwu.apk',
    ios: 'kaiwu.ipa',
    server: 'happier-server-linux-x64.tar.gz',
    npm: 'kaiwu-cli.tgz',
    harmony: 'kaiwu.hap',
};

function sha256File(filePath) {
    const hash = createHash('sha256');
    const buffer = readFileSync(filePath);
    hash.update(buffer);
    return hash.digest('hex');
}

function runCommand(cmd, options = {}) {
    console.log(`[EXEC] ${cmd}`);
    return execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], ...options });
}

function parseCliArgs() {
    const { values } = parseArgs({
        options: {
            platform: { type: 'string', short: 'p' },
            version: { type: 'string', short: 'v' },
            file: { type: 'string', short: 'f' },
            'remote-host': { type: 'string', default: 'ubuntu@150.158.55.6' },
            'cos-bucket': { type: 'string', default: 'kaiwu-static-1444025891' },
            'skip-cos': { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false },
        },
        allowPositionals: true,
    });

    if (values.help || !values.platform || !values.version || !values.file) {
        console.log(`
开物全平台安装包发布自动化工具 · Kaiwu Release Publishing Utility

用法:
  node scripts/release/publish-downloads.mjs --platform <platform> --version <version> --file <local_path> [options]

参数:
  -p, --platform      目标平台 (${SUPPORTED_PLATFORMS.join(' | ')})
  -v, --version       发布版本号 (如 0.2.28)
  -f, --file          待上传的分发包本地绝对路径或相对路径
  --remote-host       服务器 SSH 连接串 (默认: ubuntu@150.158.55.6)
  --cos-bucket        中转 COS Bucket 标识 (默认: kaiwu-static-1444025891)
  --skip-cos          跳过 COS 中转，直接 SCP (仅建议在局域网或文件小于 50MB 时使用)
  --dry-run           演练模式，仅打印将要执行的步骤，不执行实际改动
  -h, --help          查看帮助信息
        `);
        process.exit(values.help ? 0 : 1);
    }

    if (!SUPPORTED_PLATFORMS.includes(values.platform)) {
        console.error(`[ERROR] 不受支持的平台: ${values.platform}。有效平台: ${SUPPORTED_PLATFORMS.join(', ')}`);
        process.exit(1);
    }

    const localFile = resolve(process.cwd(), values.file);
    if (!existsSync(localFile)) {
        console.error(`[ERROR] 文件不存在: ${localFile}`);
        process.exit(1);
    }

    return {
        platform: values.platform,
        version: values.version,
        localFile,
        remoteHost: values['remote-host'],
        cosBucket: values['cos-bucket'],
        skipCos: values['skip-cos'],
        dryRun: values['dry-run'],
    };
}

async function main() {
    const config = parseCliArgs();
    const stats = statSync(config.localFile);
    const size = stats.size;
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    const sha256 = sha256File(config.localFile);
    const targetFilename = CANONICAL_FILENAMES[config.platform](config.version);
    const latestAlias = LATEST_ALIASES[config.platform];

    console.log(`\n======================================================`);
    console.log(` 🚀 开始上架开物安装包 -> 下载中心 (K-DL)`);
    console.log(` 平台:     ${config.platform}`);
    console.log(` 版本:     ${config.version}`);
    console.log(` 本地文件: ${config.localFile}`);
    console.log(` 体积:     ${size} 字节 (~${sizeMb} MB)`);
    console.log(` SHA256:   ${sha256}`);
    console.log(` 规范名称: ${targetFilename}`);
    console.log(` latest名: ${latestAlias}`);
    console.log(`======================================================\n`);

    if (config.dryRun) {
        console.log(`[DRY-RUN] 演练完成，未进行任何实际远程写入。`);
        return;
    }

    const remoteReleasesBase = `/opt/wuji-kaiwu/docs/html/releases/${config.platform}`;
    const remoteVersionDir = `${remoteReleasesBase}/${config.version}`;
    const remoteLatestDir = `${remoteReleasesBase}/latest`;
    const remoteTargetFile = `${remoteVersionDir}/${targetFilename}`;
    const remoteLatestFile = `${remoteLatestDir}/${latestAlias}`;

    // 1. 创建服务器端目录
    console.log(`\n[步骤 1/6] 创建远程服务器目标目录...`);
    runCommand(`ssh ${config.remoteHost} "sudo mkdir -p ${remoteVersionDir} ${remoteLatestDir} && sudo chown -R ubuntu:ubuntu ${remoteReleasesBase}"`);

    // 2. 文件传输 (根据体积选择 COS 中转或直传)
    console.log(`\n[步骤 2/6] 文件传输至远程服务器...`);
    // Caddy 把 /docs/releases/ 下的二进制 302 到 dl.wujilabs.cn（COS 前的 CDN），所以 COS 必须与源站同键：
    // 版本文件 + latest 别名都要上传，否则下载链接 404。大文件再由服务器从 COS 内网拉取，保护 6 Mbps 源站带宽。
    const cosVersionKey = `docs/releases/${config.platform}/${config.version}/${targetFilename}`;
    const cosLatestKey = `docs/releases/${config.platform}/latest/${latestAlias}`;
    if (!config.skipCos) {
        console.log(`[INFO] 上传到 COS: ${cosVersionKey} + ${cosLatestKey}`);
        const cosPut = resolve(dirname(fileURLToPath(import.meta.url)), 'cos_put.py');
        runCommand(`uv run -q --no-project --with cos-python-sdk-v5 python -I "${cosPut}" "${config.localFile}" "${cosVersionKey}" "${cosLatestKey}"`);
    }
    const shouldPullFromCos = !config.skipCos && size > 50 * 1024 * 1024;

    if (shouldPullFromCos) {
        const publicBaseUrl = (process.env.KAIWU_PUBLIC_BASE_URL || 'https://kaiwu-static.wujilabs.cn').replace(/\/+$/, '');
        const cosUrl = `${publicBaseUrl}/${cosVersionKey}`;
        console.log(`[INFO] 文件较大 (${sizeMb} MB)，服务器从 COS 拉取...`);
        runCommand(`ssh ${config.remoteHost} "curl -fsSL '${cosUrl}' -o '${remoteTargetFile}'"`);
    } else {
        console.log(`[INFO] 使用直接 SCP 传输文件...`);
        runCommand(`scp "${config.localFile}" ${config.remoteHost}:${remoteTargetFile}`);
    }

    // 3. 服务器端 SHA256 比对
    console.log(`\n[步骤 3/6] 服务器端校验落地文件哈希...`);
    const remoteShaOutput = runCommand(`ssh ${config.remoteHost} "sha256sum ${remoteTargetFile}"`).trim();
    const remoteSha = remoteShaOutput.split(/\s+/)[0];

    if (remoteSha.toLowerCase() !== sha256.toLowerCase()) {
        console.error(`[ERROR] 校验失败! 本地哈希 (${sha256}) 与远程哈希 (${remoteSha}) 不匹配!`);
        process.exit(1);
    }
    console.log(`[OK] SHA256 校验一致: ${remoteSha}`);

    // 4. 创建/更新 latest 软链接
    console.log(`\n[步骤 4/6] 更新 latest 软链接与硬链接别名...`);
    runCommand(`ssh ${config.remoteHost} "ln -sf '${remoteTargetFile}' '${remoteLatestFile}'"`);

    // 5. 更新 manifest.json
    console.log(`\n[步骤 5/6] 更新机器可读清单 manifest.json...`);
    const manifestPath = `/opt/wuji-kaiwu/docs/html/download/manifest.json`;
    const currentManifestJson = runCommand(`ssh ${config.remoteHost} "cat ${manifestPath}"`);
    // fail-closed：读不到合法清单就停，绝不以空清单重写（2026-10-21 曾因此把线上清单写成只剩一个平台）。
    let manifest;
    try {
        manifest = JSON.parse(currentManifestJson);
    } catch (error) {
        console.error(`[ERROR] 远程 manifest.json 无法解析，拒绝覆盖: ${error.message}`);
        process.exit(1);
    }
    if (!manifest || typeof manifest.platforms !== 'object' || Object.keys(manifest.platforms).length === 0) {
        console.error('[ERROR] 远程 manifest.json 没有任何平台条目，拒绝覆盖。请先从备份恢复。');
        process.exit(1);
    }
    const platformCountBefore = Object.keys(manifest.platforms).length;

    manifest.updatedAt = new Date().toISOString();
    manifest.platforms[config.platform] = {
        version: config.version,
        filename: targetFilename,
        size: size,
        sha256: sha256,
        url: `https://kaiwu.wujilabs.cn/download/${config.platform}`,
        versionedUrl: `https://kaiwu.wujilabs.cn/download/${config.platform}/${config.version}`,
        directUrl: `https://kaiwu.wujilabs.cn/docs/releases/${config.platform}/${config.version}/${targetFilename}`,
    };

    // 同步更新本地和远端 manifest.json
    const updatedJson = JSON.stringify(manifest, null, 2);
    const localManifestPath = resolve(process.cwd(), 'apps/website/public/download/manifest.json');
    if (existsSync(localManifestPath)) {
        writeFileSync(localManifestPath, updatedJson + '\n', 'utf8');
        console.log(`[OK] 已更新本地清单: ${localManifestPath}`);
    }

    // 写入远程 manifest.json：先备份，再经临时文件 scp（ssh heredoc 在 Windows 下会写出空文件），最后回读校验。
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    runCommand(`ssh ${config.remoteHost} "cp ${manifestPath} ${manifestPath}.bak-${stamp}"`);
    const tmpManifest = resolve(tmpdir(), `kaiwu-manifest-${process.pid}.json`);
    writeFileSync(tmpManifest, updatedJson + '\n', 'utf8');
    runCommand(`scp -q "${tmpManifest}" ${config.remoteHost}:${manifestPath}`);
    const readBack = JSON.parse(runCommand(`ssh ${config.remoteHost} "cat ${manifestPath}"`));
    const platformCountAfter = Object.keys(readBack.platforms ?? {}).length;
    if (readBack.platforms?.[config.platform]?.sha256 !== sha256 || platformCountAfter < platformCountBefore) {
        console.error(`[ERROR] 清单回读校验失败（平台数 ${platformCountBefore} -> ${platformCountAfter}），已备份为 ${manifestPath}.bak-${stamp}`);
        process.exit(1);
    }
    console.log(`[OK] 远程清单已更新并回读校验（${platformCountAfter} 个平台）`);
    console.log(`[OK] 已更新远程清单: ${manifestPath}`);

    // 6. 验证生产访问与重定向
    console.log(`\n[步骤 6/6] 验证生产环境对应跳转路由...`);
    const testUrl = `https://kaiwu.wujilabs.cn/download/${config.platform}`;
    const headOutput = runCommand(`curl -sSLI ${testUrl}`);
    console.log(`[HTTP 响应标头]\n${headOutput}`);

    console.log(`\n======================================================`);
    console.log(` ✅ 上架完成! 访问链接已生效:`);
    console.log(`   最新下载: https://kaiwu.wujilabs.cn/download/${config.platform}`);
    console.log(`   版本下载: https://kaiwu.wujilabs.cn/download/${config.platform}/${config.version}`);
    console.log(`   清单地址: https://kaiwu.wujilabs.cn/download/manifest.json`);
    console.log(`======================================================\n`);
}

main().catch((err) => {
    console.error(`[FATAL] 执行异常:`, err);
    process.exit(1);
});
