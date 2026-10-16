import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTokenStorageWebPlatformMocks } from './tokenStorage.testHelpers';
import { installLocalStorageMock } from './tokenStorage.web.testHelpers';

installTokenStorageWebPlatformMocks();

describe('TokenStorage (web) hosted relay domain migration', () => {
    let restoreLocalStorage: (() => void) | null = null;

    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        vi.doUnmock('@/sync/domains/server/url/legacyHostedServerUrl');
        vi.restoreAllMocks();
        restoreLocalStorage?.();
        restoreLocalStorage = null;
        try {
            const { setServerUrl } = await import('@/sync/domains/server/serverConfig');
            setServerUrl(null);
        } catch {
            // ignore
        }
    });

    it('canonicalizes legacy hosted origins to the current hosted origin', async () => {
        const { canonicalizeServerUrl } = await import('@/sync/domains/server/url/serverUrlCanonical');
        expect(canonicalizeServerUrl('https://kaiwu.chengqiyun.com')).toBe('https://kaiwu.wujilabs.cn');
        expect(canonicalizeServerUrl('https://api.chengqiyun.com/')).toBe('https://kaiwu.wujilabs.cn');
        expect(canonicalizeServerUrl('https://chengqiyun.com')).toBe('https://chengqiyun.com');
        expect(canonicalizeServerUrl('https://relay.example.test')).toBe('https://relay.example.test');
    });

    it('still reads credentials saved under the legacy hosted URL before the upgrade', async () => {
        restoreLocalStorage = installLocalStorageMock().restore;

        // Before the upgrade: the legacy host was not rewritten.
        vi.doMock('@/sync/domains/server/url/legacyHostedServerUrl', () => ({
            HOSTED_SERVER_HOSTNAME: 'kaiwu.wujilabs.cn',
            LEGACY_HOSTED_SERVER_HOSTNAME: 'kaiwu.chengqiyun.com',
            isLegacyHostedHostname: () => false,
            legacyHostedServerUrlFor: () => null,
        }));
        {
            const { setServerUrl } = await import('@/sync/domains/server/serverConfig');
            const { TokenStorage } = await import('./tokenStorage');
            setServerUrl('https://kaiwu.chengqiyun.com');
            await expect(TokenStorage.setCredentials({ token: 'legacy-token', secret: 'legacy-secret' })).resolves.toBe(true);
        }

        // After the upgrade.
        vi.doUnmock('@/sync/domains/server/url/legacyHostedServerUrl');
        vi.resetModules();
        const { setServerUrl } = await import('@/sync/domains/server/serverConfig');
        const { TokenStorage } = await import('./tokenStorage');
        setServerUrl('https://kaiwu.wujilabs.cn');
        await expect(TokenStorage.getCredentials()).resolves.toEqual({ token: 'legacy-token', secret: 'legacy-secret' });
    });
});
