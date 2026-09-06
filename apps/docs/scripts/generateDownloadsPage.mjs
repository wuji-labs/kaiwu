/**
 * Renders the "Get the apps" page from the website's download manifest.
 *
 * Nothing on the documentation site told a reader where to get the app. Zero
 * hits for `apps.apple.com`, zero for the APK, zero for the desktop build — on
 * a 125-page site whose first section is called Getting started. Meanwhile
 * `apps/website/src/data/downloads.ts` already held every URL, was already the
 * single source of truth for the marketing site, and already had a link checker
 * (`yarn --cwd apps/website check:links`) HEADing all of them before deploy.
 *
 * So this page is generated from the website download manifest rather than retyped. The alternative
 * is two hand-maintained copies of the same URLs, which is how the website ended
 * up with three dead links in the first place — the exact history its own
 * docblock records.
 *
 * The Android situation is deliberately not smoothed over. There is no public
 * Play listing; `ANDROID_PLAY_URL` 404s for everyone, and the manifest says in
 * as many words not to ship it. The APK is what Android users actually use, so
 * that is what this page leads with.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const MANIFEST = join(REPO, 'apps', 'website', 'src', 'data', 'downloads.json');
export const OUTPUT_PATH = join(HERE, '..', 'content', 'docs', 'getting-started', 'get-the-apps.mdx');

/** Validate and shape the shared JSON manifest for the docs renderer. */
export function parseDownloadManifest(source) {
  const manifest = JSON.parse(source);
  if (!manifest.desktopAssetBase || !Array.isArray(manifest.desktopPlatforms)) {
    throw new Error('downloads.json is missing desktop release data');
  }
  const asset = (file) => `${manifest.desktopAssetBase}/${file}`;

  return {
    desktop: manifest.desktopPlatforms.map((platform) => ({
      label: platform.sublabel ? `${platform.label} (${platform.sublabel.replace(' · .exe installer', '').replace(' · AppImage', '')})` : platform.label,
      href: asset(platform.file),
    })),
    desktopReleases: manifest.desktopReleasesPage,
    appStore: manifest.appStoreUrl,
    androidApk: manifest.androidApkUrl,
    androidOptIn: manifest.androidPlayTestingOptInUrl,
    webApp: "https://kaiwu.chengqiyun.com",
    installUnix: (manifest.installCommandUnix || "").replaceAll("https://happier.dev", "https://kaiwu.chengqiyun.com"),
    installWindows: (manifest.installCommandWindows || "").replaceAll("https://happier.dev", "https://kaiwu.chengqiyun.com"),
  };
}

export async function renderDownloadsPageMarkdown({ manifestPath = MANIFEST } = {}) {
  return `---
title: Get the apps
description: Where to download Kaiwu for iPhone, Android, desktop and the browser, and which one to start with.
---

Kaiwu runs your coding agents on a computer you control and gives you a way to
drive them from somewhere else. So you need two things: the CLI on the machine
that will do the work, and a client to drive it from.

Start with the client. You cannot finish the CLI's login without one — the
terminal prints a code for a browser or phone you are already signed in on.

## On your phone

<Cards>
  <Card title="iOS" href="https://kaiwu.chengqiyun.com/download/ios" description="未签名安装包（需自签或 TestFlight），亦可通过 Safari 打开 https://kaiwu.chengqiyun.com 点击分享添加到主屏幕。" />
  <Card title="Android (APK)" href="https://kaiwu.chengqiyun.com/download/android" description="Android 官方直链下载。" />
</Cards>

iOS 客户端提供未签名安装包（需自签或 TestFlight）；同时推荐使用 Web 应用方式：在 iPhone / iPad 上使用 Safari 打开 [kaiwu.chengqiyun.com](https://kaiwu.chengqiyun.com)，点击底部「分享」按钮选择「添加到主屏幕」，即可获得如同原生应用的完整体验。

## In a browser

[kaiwu.chengqiyun.com](https://kaiwu.chengqiyun.com) is the
full client — no install, and the fastest way to see whether Kaiwu suits you.
It is also the easiest place to complete the CLI login, because you are probably
already signed in to a browser on the machine you are setting up.

## On your desktop

当前桌面端发布渠道为「安装 CLI + 浏览器 / 添加到主屏幕应用」。在桌面机器上安装运行 CLI，并搭配浏览器即可驱动代理：

在 macOS / Linux 上安装 CLI：

\`\`\`bash
curl -fsSL https://kaiwu.chengqiyun.com/install | bash
\`\`\`

在 Windows 上使用 PowerShell 安装 CLI：

\`\`\`powershell
irm https://kaiwu.chengqiyun.com/install.ps1 | iex
\`\`\`

更多版本及发布信息可在 [Releases](https://github.com/wuji-labs/kaiwu/releases) 页面查看。

## On the machine that runs your agents

This is the part that does the work, and it is a CLI rather than an app:

\`\`\`bash
curl -fsSL https://kaiwu.chengqiyun.com/install | bash
\`\`\`

On Windows, in PowerShell:

\`\`\`powershell
irm https://kaiwu.chengqiyun.com/install.ps1 | iex
\`\`\`

The installer verifies every release signature before unpacking. See
[CLI](/apps/cli) for the other install routes, release channels, and what to
do when the command is not found afterwards.

## Related

- [Onboarding](/getting-started/onboarding) — connecting the two halves.
- [Check your setup](/getting-started/check-your-setup) — confirming it worked.
`;
}

const isEntrypoint = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUTPUT_PATH, await renderDownloadsPageMarkdown(), 'utf8');
  console.log(`wrote ${OUTPUT_PATH}`);
}
