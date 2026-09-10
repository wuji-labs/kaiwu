import test from 'node:test';
import assert from 'node:assert/strict';

import { renderDownloadsPageMarkdown } from './generateDownloadsPage.mjs';

test('generated downloads page uses stable rolling desktop and Android links', async () => {
  const markdown = await renderDownloadsPageMarkdown();

  assert.match(markdown, /kaiwu\.chengqiyun\.com\/download\/android/);
  assert.doesNotMatch(markdown, /ui-mobile-preview/);
  assert.match(markdown, /kaiwu\.chengqiyun\.com\/install/);
});
