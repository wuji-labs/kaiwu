import { describe, expect, it } from 'vitest';

import { resolveAutomationsFeature } from './automationsFeature';

describe('resolveAutomationsFeature', () => {
    it('defaults to automations disabled after route removal', () => {
        const feature = resolveAutomationsFeature({} as NodeJS.ProcessEnv);

        expect(feature.features?.automations).toEqual({
            enabled: false,
        });
    });
});
