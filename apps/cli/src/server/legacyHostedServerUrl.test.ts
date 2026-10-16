import { describe, expect, it } from 'vitest';

import { rewriteLegacyHostedServerUrl } from './legacyHostedServerUrl';

describe('rewriteLegacyHostedServerUrl', () => {
  it('rewrites every legacy hosted origin to the current hosted origin', () => {
    expect(rewriteLegacyHostedServerUrl('https://kaiwu.chengqiyun.com')).toBe('https://kaiwu.wujilabs.cn');
    expect(rewriteLegacyHostedServerUrl('https://api.chengqiyun.com/')).toBe('https://kaiwu.wujilabs.cn/');
    expect(rewriteLegacyHostedServerUrl('https://APP.chengqiyun.com/docs')).toBe('https://kaiwu.wujilabs.cn/docs');
  });

  it('leaves self-hosted, local and malformed values untouched', () => {
    expect(rewriteLegacyHostedServerUrl('https://chengqiyun.com')).toBe('https://chengqiyun.com');
    expect(rewriteLegacyHostedServerUrl('https://relay.example.com')).toBe('https://relay.example.com');
    expect(rewriteLegacyHostedServerUrl('http://127.0.0.1:3005')).toBe('http://127.0.0.1:3005');
    expect(rewriteLegacyHostedServerUrl('not a url')).toBe('not a url');
    expect(rewriteLegacyHostedServerUrl('')).toBe('');
  });
});
