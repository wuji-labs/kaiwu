import { afterEach, describe, expect, it } from 'vitest';

import { createEnvKeyScope } from '@/testkit/env/envScope';
import { planDaemonServiceInstall, planDaemonServiceLifecycle } from './service/plan';

describe('daemon service install plan', () => {
  const envScope = createEnvKeyScope(['PATH']);

  afterEach(() => {
    envScope.restore();
  });

  it('plans a LaunchAgent install (darwin)', () => {
    envScope.patch({ PATH: '/custom/bin' });
    const plan = planDaemonServiceInstall({
      platform: 'darwin',
      channel: 'stable',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/opt/homebrew/bin/node',
      entryPath: '/usr/local/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/Users/test/Library/LaunchAgents/com.happier.cli.daemon.cloud.plist');
    expect(plan.files[0]?.content).toContain('<string>/opt/homebrew/bin/node</string>');
    expect(plan.files[0]?.content).toContain('<string>/usr/local/lib/node_modules/@happier-dev/cli/dist/index.mjs</string>');
    expect(plan.files[0]?.content).toContain('<string>daemon</string>');
    expect(plan.files[0]?.content).toContain('<string>start-sync</string>');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_HOME_DIR</key>');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_ACTIVE_SERVER_ID</key>');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_SERVER_URL</key>');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_PUBLIC_SERVER_URL</key>');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_DAEMON_WAIT_FOR_AUTH</key>');
    expect(plan.files[0]?.content).toContain('<key>PATH</key>');
    expect(plan.files[0]?.content).toContain('/usr/local/sbin');
    expect(plan.files[0]?.content).toContain('/opt/homebrew/sbin');

    let hasLaunchctl = false;
    const commandLines: string[] = [];
    for (const c of plan.commands) {
      if (c.cmd === 'launchctl') hasLaunchctl = true;
      commandLines.push(`${c.cmd} ${c.args.join(' ')}`);
    }
    expect(hasLaunchctl).toBe(true);
    expect(commandLines).toContain('launchctl enable gui/501/com.happier.cli.daemon.cloud');
    expect(commandLines).toContain('launchctl bootstrap gui/501 /Users/test/Library/LaunchAgents/com.happier.cli.daemon.cloud.plist');
    expect(commandLines.indexOf('launchctl bootstrap gui/501 /Users/test/Library/LaunchAgents/com.happier.cli.daemon.cloud.plist'))
      .toBeGreaterThan(commandLines.indexOf('launchctl enable gui/501/com.happier.cli.daemon.cloud'));
  });

  it('enables the darwin LaunchAgent label before bootstrapping it', () => {
    const plan = planDaemonServiceInstall({
      platform: 'darwin',
      channel: 'stable',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/opt/homebrew/bin/node',
      entryPath: '/usr/local/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    const enableIndex = plan.commands.findIndex((command) =>
      command.cmd === 'launchctl' && command.args[0] === 'enable',
    );
    const bootstrapIndex = plan.commands.findIndex((command) =>
      command.cmd === 'launchctl' && command.args[0] === 'bootstrap',
    );

    expect(enableIndex).toBeGreaterThanOrEqual(0);
    expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
    expect(enableIndex).toBeLessThan(bootstrapIndex);
  });

  it('plans channel-scoped LaunchAgent labels for preview (darwin)', () => {
    envScope.patch({ PATH: '/custom/bin' });
    const plan = planDaemonServiceInstall({
      platform: 'darwin',
      channel: 'preview',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/opt/homebrew/bin/node',
      entryPath: '/usr/local/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/Users/test/Library/LaunchAgents/com.happier.cli.daemon.preview.cloud.plist');
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_PUBLIC_RELEASE_CHANNEL</key>');
    expect(plan.files[0]?.content).toContain('<string>preview</string>');
  });

  it('preserves the raw pinned server id in service env while sanitizing launchd labels', () => {
    const plan = planDaemonServiceInstall({
      platform: 'darwin',
      channel: 'preview',
      instanceId: 'stack_macos-v0210__id_default',
      activeServerId: 'stack_macos-v0210__id_default',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
      serverUrl: 'http://127.0.0.1:53510',
      webappUrl: 'http://happier-macos-v0210.localhost:53510',
      publicServerUrl: 'http://localhost:53510',
      nodePath: '/opt/homebrew/bin/node',
      entryPath: '/usr/local/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files[0]?.path).toBe(
      '/Users/test/Library/LaunchAgents/com.happier.cli.daemon.preview.stack_macos-v0210_id_default.plist',
    );
    expect(plan.files[0]?.content).toContain(
      '<string>com.happier.cli.daemon.preview.stack_macos-v0210_id_default</string>',
    );
    expect(plan.files[0]?.content).toContain('<key>HAPPIER_ACTIVE_SERVER_ID</key>');
    expect(plan.files[0]?.content).toContain('<string>stack_macos-v0210__id_default</string>');
  });

  it('plans a systemd --user unit install (linux)', () => {
    envScope.patch({ PATH: '/home/test/.local/bin:/usr/bin' });
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'user',
      channel: 'stable',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: '/home/test',
      happierHomeDir: '/home/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/usr/bin/node',
      entryPath: '/usr/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/home/test/.config/systemd/user/happier-daemon.cloud.service');
    expect(plan.files[0]?.content).toContain('ExecStart=/usr/bin/node /usr/lib/node_modules/@happier-dev/cli/dist/index.mjs daemon start-sync');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_HOME_DIR=/home/test/.happier');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_STARTUP_SOURCE=background-service');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_SERVICE_LABEL=com.happier.cli.daemon.cloud');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_ACTIVE_SERVER_ID=cloud');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_SERVER_URL=https://api.happier.dev');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_PUBLIC_SERVER_URL=https://api.happier.dev');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_WAIT_FOR_AUTH=1');
    expect(plan.files[0]?.content).toContain('Environment=PATH=');
    expect(plan.files[0]?.content).toContain('/home/test/.local/bin');
    expect(plan.files[0]?.content).toContain('KillMode=process');
    expect(plan.files[0]?.content).toContain('ManagedOOMPreference=avoid');
    expect(plan.files[0]?.content).not.toContain('ManagedOOMMemoryPressure=');
    expect(plan.files[0]?.content).not.toContain('ManagedOOMSwap=');

    let hasSystemctl = false;
    let systemctlArgsText = '';
    for (const c of plan.commands) {
      if (c.cmd === 'systemctl') hasSystemctl = true;
      systemctlArgsText += `${c.args.join(' ')}\n`;
    }
    expect(hasSystemctl).toBe(true);
    expect(systemctlArgsText).toContain('--user daemon-reload');
  });

  it('plans a default-following systemd user unit without pinning server env', () => {
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'user',
      channel: 'preview',
      targetMode: 'default-following',
      instanceId: 'company',
      userHomeDir: '/home/test',
      happierHomeDir: '/home/test/.happier',
      serverUrl: 'https://company.example.test',
      webappUrl: 'https://app.company.example.test',
      publicServerUrl: 'https://company.example.test',
      nodePath: '/usr/bin/node',
      entryPath: '/usr/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/home/test/.config/systemd/user/happier-daemon.default.service');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_SERVICE_TARGET_MODE=default-following');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_STARTUP_SOURCE=background-service');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_DAEMON_SERVICE_LABEL=com.happier.cli.daemon.default');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_PUBLIC_RELEASE_CHANNEL=preview');
    expect(plan.files[0]?.content).not.toContain('Environment=HAPPIER_ACTIVE_SERVER_ID=');
    expect(plan.files[0]?.content).not.toContain('Environment=HAPPIER_SERVER_URL=');
    expect(plan.files[0]?.content).not.toContain('Environment=HAPPIER_PUBLIC_SERVER_URL=');
    expect(plan.files[0]?.content).toContain('ManagedOOMPreference=avoid');
    expect(plan.files[0]?.content).not.toContain('ManagedOOMMemoryPressure=');
    expect(plan.files[0]?.content).not.toContain('ManagedOOMSwap=');
  });

  it('plans channel-scoped unit names for dev (linux)', () => {
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'user',
      channel: 'publicdev',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: '/home/test',
      happierHomeDir: '/home/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/usr/bin/node',
      entryPath: '/usr/lib/node_modules/@happier-dev/cli/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/home/test/.config/systemd/user/happier-daemon.dev.cloud.service');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_PUBLIC_RELEASE_CHANNEL=dev');
  });

  it('uses launchctl print against the gui domain for darwin status checks', () => {
    const plan = planDaemonServiceLifecycle({
      platform: 'darwin',
      action: 'status',
      channel: 'stable',
      targetMode: 'default-following',
      instanceId: 'company',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
    });

    expect(plan.commands).toEqual([
      {
        cmd: 'launchctl',
        args: ['print', 'gui/501/com.happier.cli.daemon.default'],
      },
    ]);
  });

  it('plans darwin restart with kickstart-only when requested', () => {
    const plan = planDaemonServiceLifecycle({
      platform: 'darwin',
      action: 'restart',
      channel: 'stable',
      targetMode: 'default-following',
      instanceId: 'company',
      uid: 501,
      userHomeDir: '/Users/test',
      happierHomeDir: '/Users/test/.happier',
      darwinRestartMode: 'kickstart',
    });

    expect(plan.commands).toEqual([
      {
        cmd: 'launchctl',
        args: ['kickstart', '-k', 'gui/501/com.happier.cli.daemon.default'],
      },
    ]);
  });

  it('plans a systemd system unit install (linux)', () => {
    envScope.patch({ PATH: '/root/.cargo/bin:/usr/local/sbin' });
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'system',
      channel: 'stable',
      systemUser: 'happier',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: '/home/happier',
      happierHomeDir: '/home/happier/.happier',
      serverUrl: 'http://127.0.0.1:3005',
      webappUrl: 'http://127.0.0.1:3005',
      publicServerUrl: 'http://127.0.0.1:3005',
      nodePath: '/usr/local/bin/happier',
      entryPath: '',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('/etc/systemd/system/happier-daemon.cloud.service');
    expect(plan.files[0]?.content).toContain('ExecStart=/usr/local/bin/happier daemon start-sync');
    expect(plan.files[0]?.content).toContain('User=happier');
    expect(plan.files[0]?.content).toContain('WorkingDirectory=/home/happier');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_HOME_DIR=/home/happier/.happier');
    expect(plan.files[0]?.content).toContain('Environment=PATH=/usr/local/bin:/root/.cargo/bin:/usr/local/sbin:/home/happier/.local/bin:/home/happier/bin');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_ACTIVE_SERVER_ID=cloud');
    expect(plan.files[0]?.content).toContain('KillMode=process');

    const systemctlArgsText = plan.commands
      .filter((c) => c.cmd === 'systemctl')
      .map((c) => c.args.join(' '))
      .join('\n');
    expect(systemctlArgsText).toContain('daemon-reload');
    expect(systemctlArgsText).toContain('enable happier-daemon.cloud.service');
    expect(systemctlArgsText).toContain('restart happier-daemon.cloud.service');
    expect(systemctlArgsText).not.toContain('--user');
  });

  it('requires systemUser when mode=system (linux)', () => {
    expect(() =>
      planDaemonServiceInstall({
        platform: 'linux',
        mode: 'system',
        instanceId: 'cloud',
        activeServerId: 'cloud',
        userHomeDir: '/home/happier',
        happierHomeDir: '/home/happier/.happier',
        serverUrl: 'http://127.0.0.1:3005',
        webappUrl: 'http://127.0.0.1:3005',
        publicServerUrl: 'http://127.0.0.1:3005',
        nodePath: '/usr/local/bin/happier',
        entryPath: '',
      }),
    ).toThrow('systemUser is required');
  });

  it('quotes ExecStart paths that contain spaces (linux)', () => {
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'user',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: '/home/test',
      happierHomeDir: '/home/test/.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: '/opt/Node With Spaces/bin/node',
      entryPath: '/home/test/Library/Application Support/Happier/dist/index.mjs',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.content).toContain('ExecStart="/opt/Node With Spaces/bin/node" "/home/test/Library/Application Support/Happier/dist/index.mjs" daemon start-sync');
  });

  it('plans instance-specific unit names (linux)', () => {
    const plan = planDaemonServiceInstall({
      platform: 'linux',
      mode: 'user',
      channel: 'stable',
      instanceId: 'company',
      activeServerId: 'company',
      userHomeDir: '/home/test',
      happierHomeDir: '/home/test/.happier',
      nodePath: '/usr/bin/node',
      entryPath: '/usr/lib/node_modules/@happier-dev/cli/dist/index.mjs',
      serverUrl: 'https://company.example.test',
      webappUrl: 'https://app.company.example.test',
      publicServerUrl: 'https://company.example.test',
    });

    expect(plan.files[0]?.path).toBe('/home/test/.config/systemd/user/happier-daemon.company.service');
    expect(plan.files[0]?.content).toContain('Environment=HAPPIER_SERVER_URL=https://company.example.test');
  });

  it('plans a Scheduled Task install (win32)', () => {
    const plan = planDaemonServiceInstall({
      platform: 'win32',
      channel: 'stable',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: 'C:\\\\Users\\\\test',
      happierHomeDir: 'C:\\\\Users\\\\test\\\\.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: 'C:\\\\Users\\\\test\\\\.local\\\\bin\\\\happier.exe',
      entryPath: '',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('C:\\Users\\test\\.happier\\services\\happier-daemon.cloud.ps1');
    expect(plan.files[0]?.content).toContain('$env:HAPPIER_HOME_DIR');
    expect(plan.files[0]?.content).toContain('$env:HAPPIER_ACTIVE_SERVER_ID');
    expect(plan.files[0]?.content).toContain('happier.exe');

    const cmdText = plan.commands.map((c) => `${c.cmd} ${c.args.join(' ')}`).join('\n');
    expect(cmdText).toContain('schtasks /Create');
    expect(cmdText).toContain('ONLOGON');
    expect(cmdText).toContain('New-ScheduledTaskTrigger -AtStartup');
    expect(cmdText).toContain('PT1M');
  });

  it('plans channel-scoped task names for dev (win32)', () => {
    const plan = planDaemonServiceInstall({
      platform: 'win32',
      channel: 'publicdev',
      instanceId: 'cloud',
      activeServerId: 'cloud',
      userHomeDir: 'C:\\\\Users\\\\test',
      happierHomeDir: 'C:\\\\Users\\\\test\\\\.happier',
      serverUrl: 'https://api.happier.dev',
      webappUrl: 'https://app.happier.dev',
      publicServerUrl: 'https://api.happier.dev',
      nodePath: 'C:\\\\Users\\\\test\\\\.local\\\\bin\\\\happier.exe',
      entryPath: '',
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path).toBe('C:\\Users\\test\\.happier\\services\\happier-daemon.dev.cloud.ps1');
    expect(plan.files[0]?.content).toContain('HAPPIER_PUBLIC_RELEASE_CHANNEL');
  });

  it('plans default-following Scheduled Task lifecycle actions against the default task name on win32', () => {
    const plan = planDaemonServiceLifecycle({
      platform: 'win32',
      action: 'status',
      channel: 'preview',
      targetMode: 'default-following',
      instanceId: 'company',
      userHomeDir: 'C:\\Users\\test',
      happierHomeDir: 'C:\\Users\\test\\.happier',
    });

    expect(plan.commands).toEqual([
      {
        cmd: 'schtasks',
        args: ['/Query', '/TN', 'Happier\\happier-daemon.default', '/FO', 'LIST', '/V'],
      },
    ]);
  });
});
