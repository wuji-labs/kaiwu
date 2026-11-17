import { describe, expect, it } from 'vitest';

import type { DaemonSessionMarker } from '@/daemon/sessionRegistry';

import { findTrustedDirectSessionOwner } from './findTrustedDirectSessionOwner';

describe('findTrustedDirectSessionOwner', () => {
  it('finds a live Happier-managed codex owner by its persisted vendor session id', () => {
    const marker = {
      pid: 4242,
      happySessionId: 'happy_codex_owner',
      updatedAt: 200,
      flavor: 'codex',
      metadata: { flavor: 'codex', codexSessionId: 'codex-session-1' },
    } as DaemonSessionMarker;

    expect(findTrustedDirectSessionOwner({
      markers: [marker],
      providerId: 'codex',
      remoteSessionId: 'codex-session-1',
      isPidAlive: () => true,
    })).toBe(marker);
  });
});
