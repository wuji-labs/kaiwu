import assert from 'node:assert/strict';
import test from 'node:test';

import { renderWindowsScheduledTaskWrapperPs1 } from './windows_schtasks_wrapper.mjs';

test('renderWindowsScheduledTaskWrapperPs1 emits a wrapper that sets env and runs program args', () => {
  const ps1 = renderWindowsScheduledTaskWrapperPs1({
    workingDirectory: 'C:\\\\Users\\\\me\\\\.happier\\\\self-host',
    programArgs: ['C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\bin\\\\happier-server.exe'],
    env: {
      PORT: '3005',
      HAPPIER_DB_PROVIDER: 'sqlite',
    },
    stdoutPath: 'C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\logs\\\\server.out.log',
    stderrPath: 'C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\logs\\\\server.err.log',
  });

  assert.match(ps1, /Set-Location -LiteralPath/);
  assert.match(ps1, /\$env:PORT = "3005"/);
  assert.match(ps1, /\$env:HAPPIER_DB_PROVIDER = "sqlite"/);
  assert.match(ps1, /& "C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\bin\\\\happier-server\.exe"/);
  // Log targets are resolved per launch (falling back to a PID-suffixed file when another process
  // holds the configured log open), and the program redirects into the resolved paths.
  assert.match(ps1, /\$serviceOutLog = Resolve-ServiceLogPath "C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\logs\\\\server\.out\.log"/);
  assert.match(ps1, /\$serviceErrLog = Resolve-ServiceLogPath "C:\\\\Users\\\\me\\\\.happier\\\\self-host\\\\logs\\\\server\.err\.log"/);
  assert.match(ps1, /happier-server\.exe" 1>> \$serviceOutLog 2>> \$serviceErrLog/);
});

