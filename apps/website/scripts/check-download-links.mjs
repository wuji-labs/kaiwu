#!/usr/bin/env node
/**
 * HEAD every outbound URL the marketing site sends a visitor to, and fail if
 * any of them is not reachable.
 *
 * On 2026-08-08 the deployed site had six dead outbound links at once — all
 * four desktop downloads, the Google Play badge, the LICENSE link, and the
 * changelog link — and nothing in the repo could have caught any of them,
 * because they were string literals inside JSX. This script is the missing
 * check. Run it before every deploy:
 *
 *     node scripts/check-download-links.mjs
 *
 * It is deliberately NOT a vitest: it needs the network, and a unit suite that
 * fails when GitHub has a bad minute is a suite people learn to ignore.
 */

import { readFileSync } from 'node:fs';

import { classifyDownloadLinkStatus } from './download-link-health.mjs';

const downloads = JSON.parse(readFileSync(new URL('../src/data/downloads.json', import.meta.url), 'utf8'));
const desktopAssets = downloads.desktopPlatforms.map(
    ({ file }) => `${downloads.desktopAssetBase}/${file}`,
);

const TARGETS = [
    ...desktopAssets,
    downloads.desktopReleasesPage,

    // Mobile
    downloads.appStoreUrl,
    downloads.androidApkUrl,

    // Installer + trust surface
    'https://kaiwu.chengqiyun.com/install',
    downloads.installScriptUrl,
    downloads.installScriptPs1Url,
    downloads.releasePubkeyUrl,

    // Product surfaces
    downloads.webAppUrl,
    downloads.docsUrl,
    'https://kaiwu.chengqiyun.com/docs/security',
    'https://kaiwu.chengqiyun.com/docs/providers',
    'https://kaiwu.chengqiyun.com/docs/releases',
    'https://kaiwu.chengqiyun.com/docs/getting-started/onboarding',
    'https://kaiwu.chengqiyun.com/docs/deployment/self-host-runtime',
    downloads.guidesUrl,

    // Repo — note the British spelling; /LICENSE is a 404.
    downloads.githubRepoUrl,
    downloads.licenseUrl,
    'https://github.com/Kaiwu-dev/Kaiwu/graphs/contributors',

    // Published stats the counters read.
    'https://stats.kaiwu.chengqiyun.com/downloads.json',
    'https://stats.kaiwu.chengqiyun.com/discord.json',

    // Community
    'https://discord.gg/W6Pb8KuHfg',
];

const results = await Promise.all(
    TARGETS.map(async (url) => {
        try {
            let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
            // Some CDNs reject HEAD outright; retry as a ranged GET before failing.
            if (res.status === 405 || res.status === 403) {
                res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
            }
            return { url, status: res.status, health: classifyDownloadLinkStatus(res.status) };
        } catch (error) {
            const status = String(error?.message ?? error);
            return { url, status, health: classifyDownloadLinkStatus(status) };
        }
    }),
);

let failed = 0;
let inconclusive = 0;
for (const { url, status, health } of results) {
    if (health === 'fail') failed += 1;
    if (health === 'warn') inconclusive += 1;
    const label = health === 'ok' ? 'ok  ' : health === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${label} ${String(status).padEnd(6)} ${url}`);
}

if (failed > 0) {
    console.error(`\n${failed} of ${results.length} links returned definitive client errors. Do not deploy.`);
    process.exit(1);
}
if (inconclusive > 0) {
    console.warn(`\n${inconclusive} of ${results.length} links were temporarily unverifiable; no link returned a definitive client error.`);
} else {
    console.log(`\nAll ${results.length} links reachable.`);
}
