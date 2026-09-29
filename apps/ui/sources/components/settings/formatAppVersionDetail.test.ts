import { describe, expect, it } from 'vitest';

import { formatAppVersionDetail } from './formatAppVersionDetail';

describe('formatAppVersionDetail', () => {
    it('shows the plain version for the embedded bundle', () => {
        expect(formatAppVersionDetail('0.2.24', { launchSource: 'embedded', updateCreatedAt: null })).toBe('0.2.24');
    });

    it('appends the publish time when running an OTA update', () => {
        const createdAt = new Date(2026, 8, 30, 1, 5).toISOString();
        expect(formatAppVersionDetail('0.2.24', { launchSource: 'ota', updateCreatedAt: createdAt })).toBe('0.2.24 · OTA 09-30 01:05');
    });

    it('marks OTA without a usable timestamp', () => {
        expect(formatAppVersionDetail('0.2.24', { launchSource: 'ota', updateCreatedAt: 'not-a-date' })).toBe('0.2.24 · OTA');
    });
});
