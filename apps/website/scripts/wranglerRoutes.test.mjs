import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the production Worker owns the kaiwu.wujilabs.cn custom domain', async () => {
    const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

    assert.match(
        config,
        /\[\[routes\]\]\s+pattern\s*=\s*"Kaiwu\.dev"\s+custom_domain\s*=\s*true/,
    );
});
