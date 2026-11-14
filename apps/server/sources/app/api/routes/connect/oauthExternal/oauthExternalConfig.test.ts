import { describe, expect, it } from 'vitest';

import { resolveWebAppOAuthReturnUrlFromEnv, resolveWebAppOAuthReturnUrlFromRequestHeaders } from './oauthExternalConfig';

describe('resolveWebAppOAuthReturnUrlFromEnv', () => {
  it('derives the web app base URL from the canonical public server URL when local UI is served and KAIWU_WEBAPP_URL is unset', () => {
    expect(resolveWebAppOAuthReturnUrlFromEnv({
      KAIWU_PUBLIC_SERVER_URL: 'https://stack.example.test/base/',
      KAIWU_SERVER_UI_DIR: '/tmp/ui',
      KAIWU_SERVER_UI_PREFIX: '/ui/',
    }, 'github')).toBe('https://stack.example.test/base/ui/oauth/github');
  });
});

describe('resolveWebAppOAuthReturnUrlFromRequestHeaders', () => {
  it('preserves the UI base path when the loopback referer is nested under a reverse-proxy base', () => {
    const resolved = resolveWebAppOAuthReturnUrlFromRequestHeaders({
      env: {
        KAIWU_SERVER_UI_DIR: '/tmp/ui',
        KAIWU_SERVER_UI_PREFIX: '/ui',
      },
      providerId: 'github',
      headers: {
        referer: 'http://127.0.0.1:8081/base/ui/settings',
      },
    });
    expect(resolved).toBe('http://127.0.0.1:8081/base/ui/oauth/github');
  });

  it('uses the configured UI prefix for loopback origins without a referer path', () => {
    const resolved = resolveWebAppOAuthReturnUrlFromRequestHeaders({
      env: {
        KAIWU_SERVER_UI_DIR: '/tmp/ui',
        KAIWU_SERVER_UI_PREFIX: '/ui',
      },
      providerId: 'github',
      headers: {
        origin: 'http://localhost:8081',
      },
    });
    expect(resolved).toBe('http://localhost:8081/ui/oauth/github');
  });

  it('preserves the configured reverse-proxy base path for loopback origins without a referer path', () => {
    const resolved = resolveWebAppOAuthReturnUrlFromRequestHeaders({
      env: {
        KAIWU_PUBLIC_SERVER_URL: 'https://stack.example.test/base/',
        KAIWU_SERVER_UI_DIR: '/tmp/ui',
        KAIWU_SERVER_UI_PREFIX: '/ui',
      },
      providerId: 'github',
      headers: {
        origin: 'http://127.0.0.1:8081',
      },
    });
    expect(resolved).toBe('http://127.0.0.1:8081/base/ui/oauth/github');
  });

  it('preserves the configured reverse-proxy base path when the UI is root-mounted', () => {
    const resolved = resolveWebAppOAuthReturnUrlFromRequestHeaders({
      env: {
        KAIWU_PUBLIC_SERVER_URL: 'https://stack.example.test/base/',
        KAIWU_SERVER_UI_DIR: '/tmp/ui',
        KAIWU_SERVER_UI_PREFIX: '/',
      },
      providerId: 'github',
      headers: {
        referer: 'http://127.0.0.1:8081/base/settings',
      },
    });
    expect(resolved).toBe('http://127.0.0.1:8081/base/oauth/github');
  });

  it('preserves the configured reverse-proxy base path for root-mounted UI when only the loopback origin is available', () => {
    const resolved = resolveWebAppOAuthReturnUrlFromRequestHeaders({
      env: {
        KAIWU_PUBLIC_SERVER_URL: 'https://stack.example.test/base/',
        KAIWU_SERVER_UI_DIR: '/tmp/ui',
        KAIWU_SERVER_UI_PREFIX: '/',
      },
      providerId: 'github',
      headers: {
        origin: 'http://127.0.0.1:8081',
      },
    });
    expect(resolved).toBe('http://127.0.0.1:8081/base/oauth/github');
  });
});
