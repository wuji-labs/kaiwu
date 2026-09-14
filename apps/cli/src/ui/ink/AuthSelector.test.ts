import { describe, expect, it } from 'vitest';

import {
  AUTH_SELECTOR_ACCOUNT_HINT,
  AUTH_SELECTOR_FOOTER,
  AUTH_SELECTOR_MOBILE_HINT,
  AUTH_SELECTOR_OPTIONS,
  AUTH_SELECTOR_TITLE,
} from './AuthSelector';

describe('AuthSelector UI strings', () => {
  it('provides Simplified Chinese labels and hints', () => {
    expect(AUTH_SELECTOR_TITLE).toBe('请选择身份认证方式：');
    expect(AUTH_SELECTOR_MOBILE_HINT).toBe('推荐使用手机 App，账号注册与设备绑定更加简单。');
    expect(AUTH_SELECTOR_ACCOUNT_HINT).toBe('如果你已在其他设备上使用 Kaiwu，请登录同一账号。');
    expect(AUTH_SELECTOR_FOOTER).toBe('使用方向键或 1-2 选择，按 Enter 确认');
    expect(AUTH_SELECTOR_OPTIONS).toEqual([
      { method: 'mobile', label: '手机 App（推荐）' },
      { method: 'web', label: '网页浏览器' },
    ]);
  });
});
