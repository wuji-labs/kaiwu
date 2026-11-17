import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveConnectedServiceMaterializedRootDir } from './resolveConnectedServiceMaterializedRootDir';

describe('resolveConnectedServiceMaterializedRootDir', () => {

  it('falls back to the sha256-normalized materialization key when no valid identity is present', () => {
    // No (valid) identity → segment is the sha256 of the key, exactly as
    // materializeConnectedServicesForSpawn computes it. This keeps the inactive-switch reconstruction
    // byte-identical to what the next spawn will materialize into.
    const key = 'spawn-1700000000000-abcd';
    const expectedSegment = createHash('sha256').update(key, 'utf8').digest('hex');
    expect(resolveConnectedServiceMaterializedRootDir({
      baseDir: '/base',
      agentId: 'codex',
      materializationKey: key,
      materializationIdentity: null,
    })).toBe(join('/base', expectedSegment, 'codex'));
  });

});
