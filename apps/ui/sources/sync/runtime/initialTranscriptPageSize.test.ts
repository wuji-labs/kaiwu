import { describe, expect, it } from 'vitest';

import { resolveInitialSessionMessagesPageSize } from './initialTranscriptPageSize';

describe('resolveInitialSessionMessagesPageSize', () => {
    it('sizes a native first page to fill the viewport instead of the full configured page', () => {
        // iPhone 15 portrait (852 dp): ~22 rows of the smallest transcript row, ~2 messages per row.
        const phone = resolveInitialSessionMessagesPageSize({ platformOS: 'ios', viewportHeightDp: 852, configuredPageSize: 150 });
        expect(phone).toBeGreaterThanOrEqual(40);
        expect(phone).toBeLessThan(60);
        // A taller viewport needs more to fill it.
        const tablet = resolveInitialSessionMessagesPageSize({ platformOS: 'ios', viewportHeightDp: 1366, configuredPageSize: 150 });
        expect(tablet).toBeGreaterThan(phone);
    });

    it('never exceeds the configured page and never drops below one screen floor', () => {
        expect(resolveInitialSessionMessagesPageSize({ platformOS: 'android', viewportHeightDp: 100_000, configuredPageSize: 150 })).toBe(150);
        expect(resolveInitialSessionMessagesPageSize({ platformOS: 'android', viewportHeightDp: 0, configuredPageSize: 150 })).toBe(12);
        expect(resolveInitialSessionMessagesPageSize({ platformOS: 'android', viewportHeightDp: 852, configuredPageSize: 8 })).toBe(8);
    });

    it('keeps the measured web first-paint page', () => {
        expect(resolveInitialSessionMessagesPageSize({ platformOS: 'web', viewportHeightDp: 1080, configuredPageSize: 150 })).toBe(12);
    });
});
