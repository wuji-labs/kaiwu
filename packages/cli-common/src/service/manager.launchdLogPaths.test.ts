import { describe, expect, it } from 'vitest';

import { buildServiceDefinition } from './manager';

describe('buildServiceDefinition launchd log paths', () => {
  it('keeps POSIX separators for a POSIX home dir even when planned from a Windows host', () => {
    const def = buildServiceDefinition({
      backend: 'launchd-user',
      homeDir: '/Users/test',
      spec: { label: 'dev.kaiwu.daemon', description: 'Kaiwu daemon', programArgs: ['/usr/local/bin/kaiwu', 'daemon', 'start-sync'] },
    });
    expect(def.path).toBe('/Users/test/Library/LaunchAgents/dev.kaiwu.daemon.plist');
    expect(def.contents).toContain('<string>/Users/test/.happier/logs/dev.kaiwu.daemon.out.log</string>');
    expect(def.contents).toContain('<string>/Users/test/.happier/logs/dev.kaiwu.daemon.err.log</string>');
  });
});
