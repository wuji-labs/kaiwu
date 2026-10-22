import * as React from 'react';

import { useSetting } from '@/sync/domains/state/storage';
import type { SessionForkReplaySettingsSource } from '@/sync/domains/sessionFork/resolveSessionForkReplayOptions';

/**
 * Exactly the account settings a fork request reads, subscribed field by field. Consumers that
 * render per row (the session list) must not subscribe to the whole settings object, which
 * changes on every unrelated setting write and re-rendered the whole list with it.
 */
export function useSessionForkReplaySettings(): SessionForkReplaySettingsSource {
    const sessionReplayEnabled = useSetting('sessionReplayEnabled');
    const sessionReplayStrategy = useSetting('sessionReplayStrategy');
    const sessionReplayRecentMessagesCount = useSetting('sessionReplayRecentMessagesCount');
    const sessionReplayMaxSeedChars = useSetting('sessionReplayMaxSeedChars');
    const sessionReplaySummaryRunnerV1 = useSetting('sessionReplaySummaryRunnerV1');
    return React.useMemo(() => ({
        sessionReplayEnabled,
        sessionReplayStrategy,
        sessionReplayRecentMessagesCount,
        sessionReplayMaxSeedChars,
        sessionReplaySummaryRunnerV1,
    }), [
        sessionReplayEnabled,
        sessionReplayMaxSeedChars,
        sessionReplayRecentMessagesCount,
        sessionReplayStrategy,
        sessionReplaySummaryRunnerV1,
    ]);
}
