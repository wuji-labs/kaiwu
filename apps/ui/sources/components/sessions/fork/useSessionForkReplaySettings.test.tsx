import { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { renderHook } from '@/dev/testkit';
import { storage } from '@/sync/domains/state/storage';

import { useSessionForkReplaySettings } from './useSessionForkReplaySettings';

describe('useSessionForkReplaySettings', () => {
    it('keeps its identity across unrelated setting writes and follows replay setting writes', async () => {
        let renders = 0;
        const hook = await renderHook(() => {
            renders += 1;
            return useSessionForkReplaySettings();
        });
        const initial = hook.getCurrent();
        const rendersAfterMount = renders;

        await act(async () => {
            storage.getState().applySettingsLocal({ favoriteDirectories: [`~/unrelated-${Date.now()}`] });
        });
        expect(renders).toBe(rendersAfterMount);
        expect(hook.getCurrent()).toBe(initial);

        await act(async () => {
            storage.getState().applySettingsLocal({ sessionReplayEnabled: !initial.sessionReplayEnabled });
        });
        expect(hook.getCurrent().sessionReplayEnabled).toBe(!initial.sessionReplayEnabled);
        await hook.unmount();
    });
});
