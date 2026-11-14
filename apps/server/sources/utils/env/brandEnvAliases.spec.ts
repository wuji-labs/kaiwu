import { describe, expect, it } from 'vitest';

import { applyBrandEnvAliases, formatLegacyBrandEnvNotice } from './brandEnvAliases';

describe('applyBrandEnvAliases', () => {
    it('promotes a legacy HAPPIER_* value to KAIWU_* when the canonical name is unset', () => {
        const env: NodeJS.ProcessEnv = { HAPPIER_SERVER_HOST: '127.0.0.1' };
        const result = applyBrandEnvAliases(env);
        expect(env.KAIWU_SERVER_HOST).toBe('127.0.0.1');
        expect(env.HAPPIER_SERVER_HOST).toBe('127.0.0.1');
        expect(result.legacyKeysUsed).toEqual(['HAPPIER_SERVER_HOST']);
    });

    it('mirrors canonical KAIWU_* values onto legacy names for modules that still read HAPPIER_*', () => {
        const env: NodeJS.ProcessEnv = { KAIWU_SERVER_LIGHT_DB_DIR: '/data/db' };
        const result = applyBrandEnvAliases(env);
        expect(env.HAPPIER_SERVER_LIGHT_DB_DIR).toBe('/data/db');
        expect(result.legacyKeysUsed).toEqual([]);
    });

    it('lets KAIWU_* win when both spellings are set with different values', () => {
        const env: NodeJS.ProcessEnv = { KAIWU_DB_PROVIDER: 'sqlite', HAPPIER_DB_PROVIDER: 'postgres' };
        const result = applyBrandEnvAliases(env);
        expect(env.KAIWU_DB_PROVIDER).toBe('sqlite');
        expect(env.HAPPIER_DB_PROVIDER).toBe('sqlite');
        expect(result.legacyKeysUsed).toEqual([]);
    });

    it('leaves unrelated and HAPPY_* variables untouched', () => {
        const env: NodeJS.ProcessEnv = { HAPPY_SERVER_HOST: '0.0.0.0', PORT: '3005' };
        applyBrandEnvAliases(env);
        expect(env).toEqual({ HAPPY_SERVER_HOST: '0.0.0.0', PORT: '3005' });
    });

    it('is idempotent', () => {
        const env: NodeJS.ProcessEnv = { HAPPIER_API_CORS_MAX_AGE_SECONDS: '120' };
        applyBrandEnvAliases(env);
        const second = applyBrandEnvAliases(env);
        expect(env.KAIWU_API_CORS_MAX_AGE_SECONDS).toBe('120');
        expect(second.legacyKeysUsed).toEqual([]);
    });
});

describe('formatLegacyBrandEnvNotice', () => {
    it('returns null when no legacy names are in use', () => {
        expect(formatLegacyBrandEnvNotice([])).toBeNull();
    });

    it('names every legacy key in the deprecation notice', () => {
        const notice = formatLegacyBrandEnvNotice(['HAPPIER_A', 'HAPPIER_B']);
        expect(notice).toContain('HAPPIER_A, HAPPIER_B');
        expect(notice).toContain('KAIWU_');
    });
});
