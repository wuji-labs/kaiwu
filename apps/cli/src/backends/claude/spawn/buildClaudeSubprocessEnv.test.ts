import { describe, expect, it } from 'vitest';

import { buildClaudeSubprocessEnv } from './buildClaudeSubprocessEnv';

describe('buildClaudeSubprocessEnv', () => {
  it('preserves only Claude\'s exact external sandbox assertion from the runner environment', () => {
    expect(buildClaudeSubprocessEnv({
      baseEnv: {
        PATH: '/bin',
        IS_SANDBOX: '1',
        UNRELATED_SECRET: 'do-not-forward',
      },
    })).toMatchObject({
      PATH: '/bin',
      IS_SANDBOX: '1',
    });

    expect(buildClaudeSubprocessEnv({
      baseEnv: {
        PATH: '/bin',
        IS_SANDBOX: '0',
      },
    })).toEqual({ PATH: '/bin' });
  });

  it.runIf(process.platform === 'win32')('forwards standard Windows locations such as ProgramData (Windows OpenSSH exits 255 without it)', () => {
    const env = buildClaudeSubprocessEnv({
      baseEnv: {
        PATH: 'C:\\Windows',
        ProgramData: 'C:\\ProgramData',
        ProgramFiles: 'C:\\Program Files',
        SystemDrive: 'C:',
        UNRELATED_SECRET: 'do-not-forward',
      },
    });
    expect(env).toMatchObject({
      ProgramData: 'C:\\ProgramData',
      ProgramFiles: 'C:\\Program Files',
      SystemDrive: 'C:',
    });
    expect(env.UNRELATED_SECRET).toBeUndefined();
  });
});
