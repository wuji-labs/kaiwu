import { beforeEach, describe, expect, it } from 'vitest';
import {
    blockShareToken,
    clearBlockedShareTokensForTests,
    getBlockedShareTokens,
    isShareTokenBlocked,
    unblockShareToken,
} from './blockedSharesStorage';

describe('blockedSharesStorage', () => {
    beforeEach(() => {
        clearBlockedShareTokensForTests();
    });

    it('starts with an empty blocked list', () => {
        expect(getBlockedShareTokens()).toEqual([]);
        expect(isShareTokenBlocked('token-1')).toBe(false);
    });

    it('blocks and persists tokens', () => {
        blockShareToken('token-1');
        expect(isShareTokenBlocked('token-1')).toBe(true);
        expect(isShareTokenBlocked('token-2')).toBe(false);
        expect(getBlockedShareTokens()).toContain('token-1');

        blockShareToken('token-2');
        expect(isShareTokenBlocked('token-1')).toBe(true);
        expect(isShareTokenBlocked('token-2')).toBe(true);
        expect(getBlockedShareTokens()).toEqual(expect.arrayContaining(['token-1', 'token-2']));
    });

    it('handles idempotent blocking', () => {
        blockShareToken('token-1');
        blockShareToken('token-1');
        expect(getBlockedShareTokens().filter((t) => t === 'token-1')).toHaveLength(1);
    });

    it('unblocks tokens', () => {
        blockShareToken('token-1');
        blockShareToken('token-2');
        expect(isShareTokenBlocked('token-1')).toBe(true);

        unblockShareToken('token-1');
        expect(isShareTokenBlocked('token-1')).toBe(false);
        expect(isShareTokenBlocked('token-2')).toBe(true);
    });

    it('handles empty or whitespace tokens gracefully', () => {
        blockShareToken('');
        blockShareToken('   ');
        expect(getBlockedShareTokens()).toHaveLength(0);
        expect(isShareTokenBlocked('')).toBe(false);
    });
});
