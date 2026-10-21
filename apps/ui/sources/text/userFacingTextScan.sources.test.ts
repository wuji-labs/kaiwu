import { describe, expect, it } from 'vitest';

import path from 'node:path';

import { scanUserFacingStringsAsync } from '../../tools/i18n/userFacingTextScan';

const IGNORED_SCAN_TEXTS = new Set([
    'SKILL.md',
    // UI typography token (non-user-facing style value).
    'semiBold',
    // Internal notification permission status enum token.
    'notGranted',
    // Compliant branded / static Chinese footer & modal strings
    '官方网站',
    '无极开物',
    'WUJI-Labs 出品｜乾元执中（南京）科技有限公司',
    '关闭',
    '打开微信「扫一扫」添加交流',
    '微信交流二维码',
    '苏ICP备2026038842号-5A',
    // DiffMetrics measurement sample string
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
]);

function isIgnoredHit(text: string): boolean {
    if (IGNORED_SCAN_TEXTS.has(text)) {
        return true;
    }

    return /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/.test(text);
}

// The scan parses every file under sources/ synchronously, so its duration tracks disk throughput,
// not the code under test: on an idle workstation it fits in two minutes, under concurrent disk load
// it measured 220 s. The budget covers the work itself rather than an idle machine.
const FULL_SOURCES_SCAN_TIMEOUT_MS = 600_000;

describe('tools/i18n/userFacingTextScan (app sources)', () => {
    it('has no user-facing hardcoded strings in sources/', async () => {
        const hits = (await scanUserFacingStringsAsync({ sourcesRootDir: path.resolve('sources') }))
            .filter((hit) => !isIgnoredHit(hit.text));

        if (hits.length > 0) {
            const sample = hits
                .slice(0, 40)
                .map((h) => `${h.filePath}:${h.line}:${h.column} ${JSON.stringify(h.text)} (${h.kind})`)
                .join('\n');
            throw new Error(
                [
                    `Found ${hits.length} likely user-facing hardcoded strings in sources/.`,
                    'Replace these with t(...) and add the keys to sources/text/translations/*.ts.',
                    '',
                    'Sample:',
                    sample,
                ].join('\n')
            );
        }

        expect(hits).toEqual([]);
    }, FULL_SOURCES_SCAN_TIMEOUT_MS);
});
