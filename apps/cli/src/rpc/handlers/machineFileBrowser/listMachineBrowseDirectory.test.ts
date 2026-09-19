import { describe, expect, it } from 'vitest';

import { listMachineBrowseDirectory } from './listMachineBrowseDirectory';

describe('listMachineBrowseDirectory', () => {
  it('classifies an unavailable Windows drive as a missing path', async () => {
    const result = await listMachineBrowseDirectory({
      raw: { path: 'Q:\\qianyuan-wuji', includeFiles: false },
      roots: [
        { id: 'C:\\', label: 'C:', path: 'C:\\' },
        { id: 'D:\\', label: 'D:', path: 'D:\\' },
      ],
      platform: 'win32',
      maxEntries: 200,
      statConcurrency: 4,
    });

    expect(result).toEqual({
      ok: false,
      error: 'The drive for this path is not available on this machine',
      errorCode: 'not_found',
    });
  });
});
